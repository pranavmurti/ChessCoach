import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppHeader } from "@/components/AppHeader";
import { FloatingThuggyCta } from "@/components/FloatingThuggyCta";
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
        <FloatingThuggyCta />
      </body>
    </html>
  );
}
