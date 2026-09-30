import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeathClock — Your will, on-chain.",
  description: "A trustless crypto inheritance protocol for Solana.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
