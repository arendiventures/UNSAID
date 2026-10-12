import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { listProviders, defaultLlmId } from "@/lib/providers/registry";
import { findAsset } from "@/lib/services/assets";
import { Badge, Card, Notice, Stat } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const db = getDb();
  const counts = db.get<{ guests: number; sources: number; passages: number; episodes: number; review: number; pendingSources: number }>(sql`
    select (select count(*) from guests) as guests,
           (select count(*) from sources) as sources,
           (select count(*) from passages) as passages,
           (select count(*) from episodes) as episodes,
           (select count(*) from turns where review_resolved_at is null and (review_flag = 1 or state in ('needs_review','failed'))) as review,
           (select count(*) from sources where review_status in ('unreviewed','disputed')) as pendingSources`)!;
  const providers = listProviders();
  const llm = providers.find((p) => p.id === "anthropic")!;
  const logo = findAsset(db, "brand_logo");
  const localMode = defaultLlmId() !== "anthropic";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/assets/${logo.id}/file`} alt="UNSAID - What the world wants to know" className="h-24 w-auto" />
          ) : (
            <Wordmark size="lg" />
          )}
          <p className="mt-4 max-w-2xl text-sm text-ivory-dim">
            Production workspace for a human-hosted podcast featuring deeply researched, clearly labeled AI simulations of public figures. Every answer is grounded in your research collection and validated before it can be spoken.
          </p>
        </div>
        <Link href="/studio" className="btn btn-primary">
          Open interview studio
        </Link>
      </header>

      {localMode && (
        <Notice tone="warn">
          <strong>Language model not configured.</strong> The studio runs in <em>offline evidence-reader</em> mode: answers are verbatim excerpts from retrieved passages, not a persona simulation. Set <code className="font-mono">ANTHROPIC_API_KEY</code> in <code className="font-mono">.env.local</code> and test the connection in{" "}
          <Link href="/settings" className="text-amber underline">
            Settings
          </Link>
          .
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Guests" value={counts.guests} sub="profiles" />
        <Stat label="Sources" value={counts.sources} sub="in research" />
        <Stat label="Passages" value={counts.passages} sub="searchable" />
        <Stat label="Episodes" value={counts.episodes} sub="sessions" />
        <Stat label="Needs review" value={counts.review} sub={<Link href="/review" className="hover:text-amber-bright">{counts.pendingSources} source(s) unreviewed →</Link>} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Workflow" title="Milestone 1 loop">
          <ol className="space-y-3 text-sm text-ivory-dim">
            <li><span className="text-amber">1.</span> <Link href="/guests" className="text-ivory underline-offset-2 hover:underline">Guests</Link>: keep statements, allegations, interpretations and performance directions separate.</li>
            <li><span className="text-amber">2.</span> <Link href="/research" className="text-ivory underline-offset-2 hover:underline">Research</Link>: upload text, markdown or text-based PDFs, or paste excerpts with a source link. Search returns real passage ids.</li>
            <li><span className="text-amber">3.</span> <Link href="/studio" className="text-ivory underline-offset-2 hover:underline">Studio</Link>: typed questions go through retrieve → generate → validate before anything is shown as spoken.</li>
            <li><span className="text-amber">4.</span> <Link href="/episodes" className="text-ivory underline-offset-2 hover:underline">Episodes</Link>: transcript, producer evidence map and exports persist independently of any recording.</li>
          </ol>
        </Card>
        <Card eyebrow="Integrations" title="Provider status">
          <ul className="space-y-2 text-sm">
            {providers.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
                <span className="text-ivory">{p.name}</span>
                {!p.implemented ? <Badge>Planned</Badge> : p.configured ? <Badge tone="ok">Configured</Badge> : <Badge tone="warn">Not configured</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ivory-mute">LLM: {llm.selection.model}. Recording is OBS-based; see Episodes → capture view.</p>
        </Card>
      </div>
    </div>
  );
}
