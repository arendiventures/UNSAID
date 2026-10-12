import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const oswald = localFont({ src: "../../public/fonts/oswald-variable.woff2", variable: "--font-oswald", weight: "200 700", display: "swap" });
const inter = localFont({ src: "../../public/fonts/inter-variable.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });
const mono = localFont({ src: "../../public/fonts/jetbrains-mono-variable.woff2", variable: "--font-jetbrains", weight: "100 800", display: "swap" });

export const metadata: Metadata = {
  title: { default: "UNSAID Studio", template: "%s | UNSAID Studio" },
  description: "Private production workspace for UNSAID - what the world wants to know.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
