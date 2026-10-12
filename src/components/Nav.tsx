"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wordmark } from "./Wordmark";

const ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/guests", label: "Guests" },
  { href: "/research", label: "Research" },
  { href: "/studio", label: "Interview Studio" },
  { href: "/episodes", label: "Episodes" },
  { href: "/assets", label: "Assets" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ authRequired }: { authRequired: boolean }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-bg-elev/80 px-4 py-6 backdrop-blur">
      <div className="px-2">
        <Wordmark size="md" href="/" />
      </div>
      <nav className="mt-8 flex flex-col gap-1">
        {ITEMS.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className="nav-link" aria-current={active ? "page" : undefined}>
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 px-2 text-xs text-ivory-mute">
        <div className="badge badge-amber">Private production workspace</div>
        <p>All guest output is a labeled AI simulation. Nothing here is testimony.</p>
        {authRequired && (
          <button className="btn btn-ghost btn-sm" onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/login"))}>
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}
