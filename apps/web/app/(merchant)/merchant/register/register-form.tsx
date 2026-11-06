"use client";

import { useActionState } from "react";
import { registerSeller } from "./actions";
import { initialState, type RegisterState } from "./state";

/**
 * Two steps on one page, one server action between them: Studio records what it wants signed, then
 * checks the signature against that record. The second form carries only the token and the signature,
 * because the seller's name and refund vault are read back from the challenge, not from whatever this
 * request brought.
 */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(registerSeller, initialState);

  if (state.step === "done" && state.registered) {
    return (
      <section className="panel" data-testid="registered-notice">
        <span className="field-label">Registered</span>
        <h1>{state.registered.name}</h1>
        <p className="notice">
          Studio checked the signature against the challenge it issued and saved the seller. Nothing here moved funds.
        </p>
        <p className="prose">
          Seller address <span className="mono">{state.registered.address}</span>
        </p>
        <p className="actions">
          <a className="cta" href={`/merchant?seller=${state.registered.address}`}>
            Open the dashboard
          </a>
        </p>
      </section>
    );
  }

  if (state.step === "sign" && state.payload && state.token) {
    return (
      <section className="panel">
        <span className="field-label">Step 2 of 2 — sign the challenge</span>
        <h1>Prove you hold this account</h1>
        <p className="prose">
          Sign the text below with the secret key of the account you gave, then paste the signature. It is valid for this
          registration once, and for fifteen minutes.
        </p>
        <label htmlFor="challenge-payload" className="field-label">
          Text to sign
        </label>
        <textarea id="challenge-payload" className="field mono" rows={7} readOnly value={state.payload} spellCheck={false} />
        {state.error && (
          <p className="error-note" role="alert" data-testid="register-error" id="register-error">
            {state.error}
          </p>
        )}
        <form action={formAction} data-testid="register-confirm">
          <input type="hidden" name="step" value="sign" />
          <input type="hidden" name="token" value={state.token} />
          <label htmlFor="signature" className="field-label">
            Signature (hex or base64)
          </label>
          <textarea
            id="signature"
            name="signature"
            className="field mono"
            rows={3}
            required
            spellCheck={false}
            aria-describedby={state.error ? "register-error" : undefined}
            data-testid="signature-input"
          />
          <p className="actions">
            <button type="submit" className="cta" disabled={pending}>
              {pending ? "Checking the signature…" : "Register the seller"}
            </button>
          </p>
        </form>
      </section>
    );
  }

  return (
    <section className="panel">
      <span className="field-label">Step 1 of 2 — the seller</span>
      <h1>Register a seller</h1>
      <p className="prose">
        Studio will not add a seller because a form said so. Fill this in and it hands you a challenge to sign with the
        account&rsquo;s own key.
      </p>
      {state.error && (
        <p className="error-note" role="alert" data-testid="register-error" id="register-error">
          {state.error}
        </p>
      )}
      <form action={formAction} data-testid="register-form">
        <input type="hidden" name="step" value="details" />
        <label htmlFor="address" className="field-label">
          Stellar account address
        </label>
        <input
          id="address"
          name="address"
          className="field mono"
          required
          spellCheck={false}
          placeholder="G…"
          aria-describedby={state.error ? "register-error" : undefined}
        />
        <label htmlFor="name" className="field-label">
          Display name
        </label>
        <input id="name" name="name" className="field" required maxLength={200} placeholder="Northstar Research API" />
        <label htmlFor="delivery-key" className="field-label">
          Delivery key (ed25519 public key, hex)
        </label>
        <input id="delivery-key" name="delivery_key" className="field mono" required spellCheck={false} maxLength={64} />
        <label htmlFor="refund-vault" className="field-label">
          Refund vault contract (optional)
        </label>
        <input id="refund-vault" name="refund_vault" className="field mono" spellCheck={false} placeholder="C…" />
        <p className="actions">
          <button type="submit" className="cta" disabled={pending}>
            {pending ? "Recording the challenge…" : "Ask for a challenge"}
          </button>
        </p>
      </form>
    </section>
  );
}
