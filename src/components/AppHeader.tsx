"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/coach", label: "Analyze" },
  { href: "/patterns", label: "Patterns" },
  { href: "/statistics", label: "Statistics" },
  { href: "/deep-dive", label: "Deep Dive" },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white/70 shadow-[0_1px_0_rgba(28,25,23,0.06)] backdrop-blur-md dark:bg-zinc-950/70 dark:shadow-[0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground transition hover:opacity-80"
        >
          Chess Coach
        </Link>
        <nav
          className="flex items-center gap-1 sm:gap-2"
          aria-label="Main navigation"
        >
          {nav.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-foreground/10 text-foreground"
                    : "text-foreground/65 hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
