import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register a seller · Pactwright Studio" };

/** Sellers used to exist only because `seed.sql` said so. studio#88, ROADMAP P7-21. */
export default function RegisterSellerPage() {
  return (
    <main className="shell">
      <RegisterForm />
    </main>
  );
}
