import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./header.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Parcela",
  description: "Understand the regulatory barriers to housing in your jurisdiction.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* E9-10: App header with Parcela logo */}
        <header className="app-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/parcela-logo.svg" alt="Parcela" height="28" className="app-logo" />
          <nav className="app-nav">
            <span className="app-tagline">Housing Regulatory Impact Simulator</span>
          </nav>
        </header>
        <div className="app-body">
          {children}
        </div>
      </body>
    </html>
  );
}
