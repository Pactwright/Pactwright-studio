import type { ReactNode } from "react";
import { Bodoni_Moda, Courier_Prime } from "next/font/google";
import { Seal } from "@/components/Seal";
import { DeskNav } from "@/components/DeskNav";
import { getNetwork } from "@/lib/explorer";
import "./globals.css";

// Printed matter: an engraved serif whose optical sizes stay sturdy at label sizes.
const printed = Bodoni_Moda({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-printed" });
// Typed matter: everything filled in on the form (amounts, addresses, hashes).
const typed = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-typed" });

export const metadata = {
  title: "Pactwright Studio",
  description: "The public record of purchases made by AI agents on Stellar.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const network = getNetwork();
  return (
    <html lang="en" className={`${printed.variable} ${typed.variable}`}>
      <body>
        <header className="desk-head">
          <a className="brand" href="/">
            <Seal size={40} label="" />
            Pactwright Studio
          </a>
          <DeskNav />
        </header>
        {children}
        <footer className="desk-foot">
          Showing Stellar {network === "pubnet" ? "mainnet" : "testnet"}. Pacts and their timelines are read from the chain.
        </footer>
      </body>
    </html>
  );
}
