"use client";

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
      </header>

      <div className="mt-10 flex w-full justify-center">
        <ChessCoach />
      </div>
    </SitePageShell>
  );
}
