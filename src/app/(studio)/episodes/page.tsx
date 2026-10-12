import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listEpisodes } from "@/lib/services/episodes";
import { Badge, Card, Empty, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function EpisodesPage() {
  const rows = listEpisodes(getDb());
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Episodes</div>
          <h1 className="display text-4xl font-semibold">Sessions and exports</h1>
          <p className="mt-2 text-sm text-ivory-dim">Every session persists its transcript, evidence map and review flags independently of OBS.</p>
        </div>
        <Link href="/studio" className="btn btn-primary">New session</Link>
      </header>
      {rows.length === 0 ? (
        <Empty title="No episodes yet">Start a session in the Interview Studio.</Empty>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="eyebrow text-left"><tr><th className="pb-2">Episode</th><th className="pb-2">Guest</th><th className="pb-2">Mode</th><th className="pb-2">Turns</th><th className="pb-2">Status</th><th className="pb-2">Created</th></tr></thead>
            <tbody>
              {rows.map(({ episode: e, guestName, turnCount }) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-2"><Link href={`/episodes/${e.id}`} className="display text-base text-ivory hover:text-amber-bright">{e.title}</Link></td>
                  <td className="py-2 text-ivory-dim">{guestName}</td>
                  <td className="py-2 text-ivory-dim">{e.mode}</td>
                  <td className="py-2 text-ivory-dim">{turnCount}</td>
                  <td className="py-2"><Badge tone={e.status === "live" ? "ok" : e.status === "ended" ? "default" : "warn"}>{e.status}</Badge></td>
                  <td className="py-2 text-ivory-mute">{fmtDate(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
