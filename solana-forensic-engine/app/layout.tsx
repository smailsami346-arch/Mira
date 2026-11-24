import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solana Forensic Engine",
  description: "On-chain forensic analysis for Solana tokens",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <body>{children}</body>
    </html>
  );
}
