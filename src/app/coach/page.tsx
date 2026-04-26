"use client";

import Link from "next/link";

import { ChessCoach } from "@/components/ChessCoach";
import { SitePageShell } from "@/components/SitePageShell";

export default function CoachPage() {
  return (
    <SitePageShell maxWidthClass="max-w-6xl">
      <header className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
          Board &amp; tools
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Analyze &amp; review
        </h1>
        <div className="mt-4">
          <Link
            href="/deep-dive"
            className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
          >
            Deep Dive with ThuggyBot
          </Link>
        </div>
      </header>

      <div className="mt-10 flex w-full justify-center">
        <ChessCoach />
      </div>
    </SitePageShell>
  );
}
