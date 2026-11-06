"use server";

import { completeSellerRegistration, issueRegistrationChallenge, type SellerRegistration } from "./registration";
import { initialState, type RegisterState } from "./state";

/**
 * The POST behind `/merchant/register`. One action for both steps, because the two steps are one flow:
 * with a `useActionState` per step, the second step's answer would have its own state and the page
 * would still be rendering the first step's — a successful registration that never appears.
 *
 * `formData.step` only chooses which half runs; it grants nothing. Each half re-reads its own inputs
 * and the challenge row, so a request that claims to be a step it is not simply gets that step's
 * validation. Each returns the whole state the form renders from, so a refusal carries its sentence out
 * of the server and nothing has to be guessed on the way back in.
 *
 * Only async functions are exported from this file — the state shape lives in `./state`, because Next
 * refuses any other kind of export from a `"use server"` module.
 */
export async function registerSeller(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  return formData.get("step") === "sign" ? await signStep(formData) : await detailsStep(formData);
}

async function detailsStep(formData: FormData): Promise<RegisterState> {
  const result = await issueRegistrationChallenge(fields(formData));
  if (!result.ok) return { ...initialState, step: "details", error: result.message };
  return { step: "sign", error: null, token: result.value.token, payload: result.value.payload, registered: null };
}

/**
 * Step two takes two values from the browser — which challenge, and the signature — and the text shown
 * afterwards is the one read back from that challenge's row. A request cannot restate the name, the
 * refund vault, or even the words the seller was asked to sign.
 */
async function signStep(formData: FormData): Promise<RegisterState> {
  const token = String(formData.get("token") ?? "");
  const result = await completeSellerRegistration(token, String(formData.get("signature") ?? ""));
  if (!result.ok) return { step: "sign", error: result.message, token, payload: result.payload ?? null, registered: null };
  return {
    step: "done",
    error: null,
    token: null,
    payload: null,
    registered: { address: result.value.address, name: result.value.name },
  };
}

function fields(formData: FormData): SellerRegistration {
  const vault = String(formData.get("refund_vault") ?? "").trim();
  return {
    address: String(formData.get("address") ?? ""),
    name: String(formData.get("name") ?? ""),
    deliveryKey: String(formData.get("delivery_key") ?? ""),
    refundVault: vault === "" ? null : vault,
  };
}
