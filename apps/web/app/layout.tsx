import type { ReactNode } from "react";

export const metadata = { title: "Pactwright", description: "Accountable AI-agent purchases on Stellar" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
