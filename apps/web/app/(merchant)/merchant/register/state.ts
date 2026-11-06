/**
 * The state `/merchant/register` renders from, shared by the server actions and the client form.
 *
 * It lives here because a `"use server"` module may export async functions and nothing else — Next
 * rejects the file at request time with `A "use server" file can only export async functions, found
 * object`. The form needs the same initial value the actions do, so neither side can drift into
 * inventing a step the other never sets, and `test/unit/merchant-registration.test.ts` holds the
 * actions module to the rule.
 */
export interface RegisterState {
  step: "details" | "sign" | "done";
  error: string | null;
  token: string | null;
  payload: string | null;
  registered: { address: string; name: string } | null;
}

export const initialState: RegisterState = { step: "details", error: null, token: null, payload: null, registered: null };
