/**
 * The JSON Schema subset `app/api/_spec/openapi.ts` is written in — which is what "check the real handlers'
 * responses against the schemas" needs without installing a validator (the issue rules out a new
 * dependency). OpenAPI 3.1 schemas are JSON Schema 2020-12, and the document only uses `type` (including
 * the `"null"` type for optional-but-present fields), `enum`, `pattern`, `format: date-time`, `required`,
 * `properties`, `items`, `additionalProperties`, `anyOf`, `minimum`, `maximum` and `$ref`, so that is what
 * this checks — and the test asserts that no other keyword appears anywhere in the document, so this cannot
 * quietly ignore a keyword somebody adds later. #83.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveRef(document: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) throw new Error(`only local refs are supported: ${ref}`);
  let found: unknown = document;
  for (const segment of ref.slice(2).split("/")) {
    if (!isObject(found) || !(segment in found)) throw new Error(`${ref} does not resolve in the document`);
    found = found[segment];
  }
  return found;
}

const TYPE_CHECKS: Record<string, (value: unknown) => boolean> = {
  object: (v) => isObject(v),
  array: (v) => Array.isArray(v),
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  null: (v) => v === null,
};

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Keywords `validateAgainst` enforces. */
export const VALIDATED_KEYWORDS = [
  "$ref",
  "additionalProperties",
  "anyOf",
  "enum",
  "format",
  "items",
  "maximum",
  "minimum",
  "pattern",
  "properties",
  "required",
  "type",
];

/** Keywords that describe a schema without constraining a value, so ignoring them is correct. */
export const DOCUMENT_KEYWORDS = ["default", "description"];

/** Where a document puts a schema, so the walk below knows what to treat as one. */
const SCHEMA_KEYWORDS = new Set([...VALIDATED_KEYWORDS, ...DOCUMENT_KEYWORDS]);

/**
 * Every keyword used by any object in the document that is in a schema position, collected by walking the
 * OpenAPI structure rather than by guessing from an object's keys — a `properties` map's keys are field
 * names, not keywords, and reading them as keywords would report `nextCursor` as an unenforced schema word.
 */
export function schemaKeywords(spec: unknown): Set<string> {
  const found = new Set<string>();

  const visit = (node: unknown): void => {
    if (!isObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      if (key === "properties" && isObject(value)) {
        for (const child of Object.values(value)) visit(child);
      } else if (key === "items" || key === "additionalProperties") {
        visit(value);
      } else if (key === "anyOf" && Array.isArray(value)) {
        for (const branch of value) visit(branch);
      } else if (!SCHEMA_KEYWORDS.has(key) && isObject(value)) {
        visit(value);
      }
    }
  };

  const root = isObject(spec) ? spec : {};
  const components = isObject(root.components) ? root.components : {};
  const schemas = isObject(components.schemas) ? components.schemas : {};
  for (const schema of Object.values(schemas)) visit(schema);

  const paths = isObject(root.paths) ? root.paths : {};
  for (const byMethod of Object.values(paths)) {
    for (const operation of Object.values(isObject(byMethod) ? byMethod : {})) {
      if (!isObject(operation)) continue;
      for (const parameter of Array.isArray(operation.parameters) ? operation.parameters : []) {
        visit(isObject(parameter) ? parameter.schema : undefined);
      }
      const body = isObject(operation.requestBody) ? operation.requestBody : undefined;
      const bodyContent = isObject(body?.content) ? bodyContentOf(body!.content) : undefined;
      visit(bodyContent);
      const responses = isObject(operation.responses) ? operation.responses : {};
      for (const response of Object.values(responses)) {
        visit(isObject(response) ? bodyContentOf(isObject(response.content) ? response.content : {}) : undefined);
      }
    }
  }
  return found;
}

function bodyContentOf(content: Record<string, unknown>): unknown {
  const media = isObject(content["application/json"]) ? content["application/json"] : {};
  return media.schema;
}

/**
 * Validate `value` against `schema`, returning one sentence per problem (empty means it fits).
 * `path` is only for the message, so a failure names the field rather than the whole response.
 */
export function validateAgainst(document: unknown, schema: unknown, value: unknown, path = "body"): string[] {
  if (!isObject(schema)) return [`${path}: the schema is not an object`];

  if (typeof schema.$ref === "string") {
    return validateAgainst(document, resolveRef(document, schema.$ref), value, path);
  }

  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.map((branch) => validateAgainst(document, branch, value, path));
    if (branches.some((branch) => branch.length === 0)) return [];
    return [`${path}: matched none of anyOf — ${branches.flat().join(" | ")}`];
  }

  const problems: string[] = [];
  const types = typeof schema.type === "string" ? [schema.type] : Array.isArray(schema.type) ? schema.type.filter((t) => typeof t === "string") : [];

  if (types.length > 0 && !types.some((type) => TYPE_CHECKS[type]?.(value))) {
    // Without a matching type there is nothing else worth checking: the message says what was expected.
    return [`${path}: expected ${types.join(" or ")}, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`];
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((allowed) => allowed === value)) {
    problems.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) problems.push(`${path}: ${value} is below ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) problems.push(`${path}: ${value} is above ${schema.maximum}`);
  }

  if (typeof value === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      problems.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
    }
    if (schema.format === "date-time" && (!DATE_TIME.test(value) || Number.isNaN(Date.parse(value)))) {
      problems.push(`${path}: ${JSON.stringify(value)} is not an ISO 8601 UTC timestamp`);
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => problems.push(...validateAgainst(document, schema.items, item, `${path}[${index}]`)));
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const name of Array.isArray(schema.required) ? schema.required : []) {
      if (!(name in value)) problems.push(`${path}.${name}: required and missing`);
    }
    for (const [name, child] of Object.entries(value)) {
      if (name in properties) {
        problems.push(...validateAgainst(document, properties[name], child, `${path}.${name}`));
        continue;
      }
      if (schema.additionalProperties === false) problems.push(`${path}.${name}: not in the schema and additionalProperties is false`);
      else if (isObject(schema.additionalProperties)) {
        problems.push(...validateAgainst(document, schema.additionalProperties, child, `${path}.${name}`));
      }
    }
  }

  return problems;
}
