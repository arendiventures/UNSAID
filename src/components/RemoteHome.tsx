"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Episode, EpisodeMode } from "@/lib/db/schema";
import { api } from "@/lib/client";
import { Wordmark } from "./Wordmark";
import { Badge, Field, Notice } from "./ui";
import type { ModeAvailability } from "./InterviewStudio";

type LiveRow = { id: string; title: string; guestName: string; mode: string; turnCount: number };

export function RemoteHome({ guests, live, modes, defaultLlmId }: { guests: { id: string; displayName: string }[]; live: LiveRow[]; modes: ModeAvailability; defaultLlmId: string }) {
  const router = useRouter();
  const [guestId, setGuestId] = useState(guests[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<EpisodeMode>(modes.audio.available ? "audio" : "text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center justify-between">
        <Wordmark size="sm" />
        <Badge tone="amber">Host remote</Badge>
      </div>
      {live.length > 0 && (
        <section className="space-y-2">
          <div className="eyebrow">Live sessions</div>
          {live.map((e) => (
            <Link key={e.id} href={`/remote/${e.id}`} className="card flex items-center justify-between p-4 hover:border-amber/50">
              <div>
                <div className="display text-lg text-ivory">{e.title}</div>
                <div className="text-xs text-ivory-mute">{e.guestName} · {e.mode} · {e.turnCount} turn{e.turnCount === 1 ? "" : "s"}</div>
              </div>
              <span className="btn btn-primary btn-sm">Join</span>
            </Link>
          ))}
        </section>
      )}
      <section className="card space-y-3 p-4">
        <div className="eyebrow">Start a session</div>
        <Field label="Guest"><select className="input" value={guestId} onChange={(e) => setGuestId(e.target.value)}>{guests.map((g) => <option key={g.id} value={g.id}>{g.displayName}</option>)}</select></Field>
        <Field label="Episode name"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Phone rehearsal 1" /></Field>
        <Field label="Mode" hint={modes[mode].available ? "" : modes[mode].reason}>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as EpisodeMode)}>
            <option value="text">Text rehearsal</option>
            <option value="audio" disabled={!modes.audio.available}>Live audio interview{modes.audio.available ? "" : " (unavailable)"}</option>
          </select>
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <button
          className="btn btn-primary w-full py-3 text-base"
          disabled={busy || !guestId || !title.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const ep = await api<Episode>("/api/episodes", { method: "POST", json: { guestId, title: title.trim(), mode, llmProvider: defaultLlmId } });
              await api(`/api/episodes/${ep.id}/start`, { method: "POST" });
              router.push(`/remote/${ep.id}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not start");
            } finally {
              setBusy(false);
            }
          }}
        >
          Start session
        </button>
      </section>
      <p className="text-center text-xs text-ivory-mute">
        Phone view for the host. Research, profiles and OBS recording stay on the desktop at <Link href="/" className="text-amber-bright">the full studio</Link>.
      </p>
    </div>
  );
}
