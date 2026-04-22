import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Inner content max width (Tailwind class). */
  maxWidthClass?: string;
  /** Vertical padding for the content column. */
  paddingClass?: string;
  /** Extra classes on the inner content wrapper. */
  contentClassName?: string;
};

/**
 * Same animated mesh + floating orbs as the marketing home page, for visual consistency.
 */
export function SitePageShell({
  children,
  maxWidthClass = "max-w-5xl",
  paddingClass = "pb-16 pt-10 md:pb-20 md:pt-14",
  contentClassName = "",
}: Props) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 home-hero-mesh" />
      <div className="pointer-events-none absolute -left-32 top-24 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl dark:bg-sky-500/15 home-float-slow" />
      <div className="pointer-events-none absolute -right-24 top-1/3 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl dark:bg-violet-400/10 home-float-delayed" />
      <div className="pointer-events-none absolute bottom-20 left-1/4 h-48 w-48 rounded-full bg-cyan-500/10 blur-2xl dark:bg-cyan-400/10 home-float-slow" />

      <div
        className={`relative mx-auto flex w-full ${maxWidthClass} flex-1 flex-col px-4 ${paddingClass} ${contentClassName}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
