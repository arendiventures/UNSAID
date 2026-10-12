import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { listGuests } from "@/lib/services/guests";
import { Badge, Card } from "@/components/ui";
import { NewGuestButton } from "@/components/GuestEditor";

export const dynamic = "force-dynamic";

const STATUS_TONE = { draft: "default", in_research: "info", rehearsal_ready: "warn", production_ready: "ok" } as const;

export default function GuestsPage() {
  const db = getDb();
  const guests = listGuests(db);
  const counts = new Map(
    db
      .all<{ id: string; sources: number; passages: number; episodes: number }>(
        sql`select g.id, (select count(*) from sources s where s.guest_id=g.id) as sources, (select count(*) from passages p where p.guest_id=g.id) as passages, (select count(*) from episodes e where e.guest_id=g.id) as episodes from guests g`,
      )
      .map((c) => [c.id, c]),
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Guests</div>
          <h1 className="display text-4xl font-semibold">Simulated guest profiles</h1>
          <p className="mt-2 max-w-2xl text-sm text-ivory-dim">Each profile is an AI simulation built from cited research. Draft profiles carry no research and no inferred personality until sources are added and reviewed.</p>
        </div>
        <NewGuestButton />
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {guests.map((g) => {
          const c = counts.get(g.id);
          return (
            <Link key={g.id} href={`/guests/${g.id}`} className="card group p-5 transition hover:border-amber/50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="display text-2xl font-semibold text-ivory group-hover:text-amber-bright">{g.displayName}</div>
                  <div className="mt-1 text-xs text-ivory-mute">{g.simulationLabel} · v{g.currentVersion}</div>
                </div>
                <Badge tone={STATUS_TONE[g.status]}>{g.status.replace(/_/g, " ")}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded bg-bg-elev p-2"><dt className="text-ivory-mute">Sources</dt><dd className="display text-lg">{c?.sources ?? 0}</dd></div>
                <div className="rounded bg-bg-elev p-2"><dt className="text-ivory-mute">Passages</dt><dd className="display text-lg">{c?.passages ?? 0}</dd></div>
                <div className="rounded bg-bg-elev p-2"><dt className="text-ivory-mute">Episodes</dt><dd className="display text-lg">{c?.episodes ?? 0}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>Research: {g.researchStatus.replace(/_/g, " ")}</Badge>
                <Badge>{g.perspective.replace(/_/g, "-")}</Badge>
                <Badge>{g.answerLength} answers</Badge>
              </div>
            </Link>
          );
        })}
      </div>
      {guests.length === 0 && (
        <Card>
          <p className="text-sm text-ivory-dim">No guests yet. Run <code className="font-mono">pnpm db:seed</code> for the draft profiles or create one above.</p>
        </Card>
      )}
    </div>
  );
}
