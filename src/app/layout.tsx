import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";

import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chess Coach — analyze, review, and train patterns",
  description:
    "Browser-based chess coach: Stockfish analysis, game review, and Lichess / Chess.com pattern training.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full font-sans antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        <Link
          href="/deep-dive"
          aria-label="Open Deep Dive with ThuggyBot"
          title="Deep Dive with ThuggyBot"
          className="fixed bottom-5 right-5 z-50 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-600 text-3xl text-white shadow-[0_16px_34px_rgba(109,40,217,0.38)] ring-2 ring-white/40 transition hover:scale-105 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 dark:ring-white/25"
        >
          <span className="pointer-events-none absolute inset-0 rounded-full animate-ping bg-fuchsia-400/20" />
          <span className="relative" aria-hidden>
            💬
          </span>
        </Link>
      </body>
    </html>
  );
}
