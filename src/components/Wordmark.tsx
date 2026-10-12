import Link from "next/link";

/**
 * Restrained CSS wordmark used in the shell and as the fallback when no logo asset is
 * registered. Only the letters A and I are amber; U, N, S and D stay ivory.
 */
export function Wordmark({ size = "md", subtitle = true, href }: { size?: "sm" | "md" | "lg" | "xl"; subtitle?: boolean; href?: string }) {
  const sizes = { sm: "text-2xl", md: "text-4xl", lg: "text-6xl", xl: "text-8xl" } as const;
  const sub = { sm: "text-[0.5rem] tracking-[0.3em]", md: "text-[0.62rem] tracking-[0.34em]", lg: "text-xs tracking-[0.42em]", xl: "text-base tracking-[0.5em]" } as const;
  const mark = (
    <span className="inline-flex flex-col items-start leading-none select-none">
      <span className={`display font-bold ${sizes[size]} tracking-[-0.01em] text-ivory`} style={{ fontWeight: 700 }}>
        UNS<span className="text-amber">AI</span>D
      </span>
      {subtitle && (
        <span className="mt-1 flex w-full flex-col gap-1">
          <span className="h-px w-full bg-gradient-to-r from-amber via-amber-deep to-transparent" />
          <span className={`display ${sub[size]} text-ivory-dim`} style={{ fontWeight: 500 }}>
            What the world wants to know
          </span>
        </span>
      )}
    </span>
  );
  return href ? (
    <Link href={href} className="no-underline">
      {mark}
    </Link>
  ) : (
    mark
  );
}
