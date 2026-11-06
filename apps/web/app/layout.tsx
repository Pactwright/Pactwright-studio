import type { ReactNode } from "react";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import { Seal } from "@/components/Seal";
import { SiteNav } from "@/components/SiteNav";
import { getNetwork } from "@/lib/explorer";
import "./globals.css";

// Headings and the brand: wide and rounded.
const display = Unbounded({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
// Reading text.
const text = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-text" });
// On-chain values only: hashes, addresses, amounts.
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

export const metadata = {
  title: "Pactwright Studio",
  description: "The public record of purchases made by AI agents on Stellar.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const network = getNetwork();
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>
        <header className="site-head">
          <a className="brand" href="/">
            <Seal size={36} label="" />
            Pactwright Studio
          </a>
          <SiteNav />
        </header>
        {children}
        <footer className="site-foot">
          <span className="live-dot" aria-hidden="true" />
          Showing Stellar {network === "pubnet" ? "mainnet" : "testnet"}. Pacts and their timelines are read from the chain.
        </footer>
      </body>
    </html>
  );
}
