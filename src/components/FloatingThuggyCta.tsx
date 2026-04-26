"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FloatingThuggyCta() {
  const pathname = usePathname();
  if (pathname === "/deep-dive") return null;

  return (
    <Link
      href="/deep-dive"
      aria-label="Open Deep Dive with ThuggyBot"
      title="Deep Dive with ThuggyBot"
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(109,40,217,0.38)] ring-2 ring-white/40 transition hover:scale-105 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 dark:ring-white/25"
    >
      <span className="pointer-events-none absolute inset-0 rounded-full animate-ping bg-fuchsia-400/20" />
      <span className="relative text-xl leading-none" aria-hidden>
        💬
      </span>
      <span className="relative">Chat with ThuggyBot</span>
    </Link>
  );
}
