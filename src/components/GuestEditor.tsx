"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Asset, Guest, GuestEntry, GuestInstructionVersion } from "@/lib/db/schema";
import { ANSWER_LENGTHS, ENTRY_CATEGORIES, GUEST_STATUSES, PERSPECTIVES, RESEARCH_STATUSES } from "@/lib/db/schema";
import { api } from "@/lib/client";
import { Badge, Card, Field, Notice, fmtDate } from "./ui";

const CATEGORY_META: Record<(typeof ENTRY_CATEGORIES)[number], { label: string; tone: "ok" | "warn" | "info" | "amber"; help: string }> = {
  verified_statement: { label: "Verified statements", tone: "ok", help: "The person's own documented public statements. Link each to a passage id when possible." },
  attributed_allegation: { label: "Attributed allegations", tone: "warn", help: "Claims made by others. Always say who said it. These are never adopted as fact." },
  behavioral_interpretation: { label: "Behavioral interpretations", tone: "info", help: "Producer interpretations of documented behavior. Marked as inference in the prompt." },
  performance_direction: { label: "Creative performance directions", tone: "amber", help: "How to perform (pace, register, mannerisms). Never a source of facts." },
};

export function NewGuestButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-primary"
      disabled={busy}
      onClick={async () => {
        const name = window.prompt("Display name for the new guest profile");
        if (!name?.trim()) return;
        setBusy(true);
        try {
          const g = await api<Guest>("/api/guests", { method: "POST", json: { displayName: name.trim() } });
          router.push(`/guests/${g.id}`);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      New guest profile
    </button>
  );
}

export function GuestEditor({ initialGuest, initialEntries, initialVersions, assets }: { initialGuest: Guest; initialEntries: GuestEntry[]; initialVersions: GuestInstructionVersion[]; assets: Asset[] }) {
  const router = useRouter();
  const [g, setG] = useState<Guest>(initialGuest);
  const [entries, setEntries] = useState(initialEntries);
  const [versions, setVersions] = useState(initialVersions);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [changeNote, setChangeNote] = useState("");

  const set = <K extends keyof Guest>(k: K, v: Guest[K]) => {
    setG((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const { id, slug, createdAt, updatedAt, currentVersion, ...rest } = g;
      void id; void slug; void createdAt; void updatedAt; void currentVersion;
      const saved = await api<Guest>(`/api/guests/${g.id}`, { method: "PATCH", json: { ...rest, changeNote: changeNote || undefined } });
      setG(saved);
      setDirty(false);
      setChangeNote("");
      setVersions(await api<GuestInstructionVersion[]>(`/api/guests/${g.id}/versions`));
      setMsg({ tone: "ok", text: `Saved. Instruction version ${saved.currentVersion}.` });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  const concept = assets.find((a) => a.kind === "guest_concept_image");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Guest profile · v{g.currentVersion}</div>
          <h1 className="display text-4xl font-semibold">{g.displayName}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="amber">{g.simulationLabel}</Badge>
            <Badge>{g.status.replace(/_/g, " ")}</Badge>
            <Badge>Research {g.researchStatus.replace(/_/g, " ")}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-64" placeholder="Change note (optional)" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </header>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card eyebrow="Identity" title="Display and status">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Display name"><input className="input" value={g.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
              <Field label="AI-simulation label" hint="Shown persistently in the studio and the capture view."><input className="input" value={g.simulationLabel} onChange={(e) => set("simulationLabel", e.target.value)} /></Field>
              <Field label="Profile status">
                <select className="input" value={g.status} onChange={(e) => set("status", e.target.value as Guest["status"])}>{GUEST_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
              </Field>
              <Field label="Research status">
                <select className="input" value={g.researchStatus} onChange={(e) => set("researchStatus", e.target.value as Guest["researchStatus"])}>{RESEARCH_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
              </Field>
            </div>
          </Card>

          <Card eyebrow="Record" title="Biography summary" actions={<Badge>{g.bioSources.length} source refs</Badge>}>
            <Field label="Summary" hint="Write from ingested sources only. Reference them below so every sentence can be traced."><textarea className="input min-h-32" value={g.bioSummary} onChange={(e) => set("bioSummary", e.target.value)} /></Field>
            <div className="mt-3 space-y-2">
              {g.bioSources.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <input className="input" placeholder="Label (e.g. Court record, 2021)" value={s.label} onChange={(e) => set("bioSources", g.bioSources.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className="input" placeholder="URL or passage id" value={s.url ?? s.passageId ?? ""} onChange={(e) => set("bioSources", g.bioSources.map((x, j) => (j === i ? { ...x, ...(e.target.value.startsWith("psg_") ? { passageId: e.target.value, url: undefined } : { url: e.target.value, passageId: undefined }) } : x)))} />
                  <button className="btn btn-ghost btn-sm" onClick={() => set("bioSources", g.bioSources.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <button className="btn btn-sm" onClick={() => set("bioSources", [...g.bioSources, { label: "" }])}>Add source reference</button>
            </div>
          </Card>

          <Card eyebrow="Framing" title="Perspective and knowledge">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Perspective">
                <select className="input" value={g.perspective} onChange={(e) => set("perspective", e.target.value as Guest["perspective"])}>{PERSPECTIVES.map((s) => <option key={s} value={s}>{s.replace(/_/g, "-")}</option>)}</select>
              </Field>
              <Field label="Knowledge cutoff" hint="e.g. 'June 2022 sentencing' or a date. The simulation is told not to assume later events."><input className="input" value={g.knowledgeCutoff} onChange={(e) => set("knowledgeCutoff", e.target.value)} /></Field>
            </div>
            <div className="mt-4"><Field label="Perspective notes"><textarea className="input min-h-20" value={g.perspectiveNotes} onChange={(e) => set("perspectiveNotes", e.target.value)} /></Field></div>
          </Card>

          <Card eyebrow="Performance" title="Voice on the page">
            <div className="grid gap-4">
              <Field label="Speaking-style notes" hint="Cadence, vocabulary, typical framings - drawn from transcripts in the research collection."><textarea className="input min-h-24" value={g.speakingStyle} onChange={(e) => set("speakingStyle", e.target.value)} /></Field>
              <Field label="Personality interpretations (clearly marked as interpretations)" hint="Never inferred from appearance, demographics or social association. These are presented to the model as producer interpretations, not facts."><textarea className="input min-h-24" value={g.personalityInterpretations} onChange={(e) => set("personalityInterpretations", e.target.value)} /></Field>
              <Field label="Answer-length preference">
                <select className="input max-w-xs" value={g.answerLength} onChange={(e) => set("answerLength", e.target.value as Guest["answerLength"])}>{ANSWER_LENGTHS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </Field>
            </div>
          </Card>

          <Card eyebrow="Evidence ledger" title="Separated record" actions={<Badge>{entries.length} entries</Badge>}>
            <p className="mb-4 text-xs text-ivory-mute">Four categories, kept apart in the prompt and in exports. Link entries to passage ids from Research so the producer panel can resolve them.</p>
            <div className="space-y-5">
              {ENTRY_CATEGORIES.map((cat) => (
                <LedgerSection key={cat} guestId={g.id} category={cat} entries={entries.filter((e) => e.category === cat)} onChange={async () => { setEntries(await api<GuestEntry[]>(`/api/guests/${g.id}/entries`)); setVersions(await api<GuestInstructionVersion[]>(`/api/guests/${g.id}/versions`)); router.refresh(); }} />
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card eyebrow="Visual" title="Avatar configuration">
            {concept ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${concept.id}/file`} alt="" className="mb-3 aspect-video w-full rounded-md object-cover" />
            ) : (
              <div className="mb-3 flex aspect-video items-center justify-center rounded-md border border-dashed border-line-strong text-xs text-ivory-mute">No concept image. Upload one in Assets.</div>
            )}
            <div className="space-y-3">
              <Field label="Mode">
                <select className="input" value={g.avatarConfig.mode ?? "static_image"} onChange={(e) => set("avatarConfig", { ...g.avatarConfig, mode: e.target.value as Guest["avatarConfig"]["mode"] })}>
                  <option value="static_image">Static image (available now)</option>
                  <option value="provider_avatar" disabled>Provider avatar (Milestone 3 - not available)</option>
                </select>
              </Field>
              <p className="text-xs text-ivory-mute">The concept image is a still. It is not an animated avatar and has no lip-sync or emotion controls.</p>
              <Field label="Asset approval">
                <select className="input" value={g.assetApproval.status ?? "pending"} onChange={(e) => set("assetApproval", { ...g.assetApproval, status: e.target.value as Guest["assetApproval"]["status"], decidedAt: new Date().toISOString() })}>
                  <option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option>
                </select>
              </Field>
              <textarea className="input min-h-16 text-xs" placeholder="Approval / permission notes" value={g.assetApproval.notes ?? ""} onChange={(e) => set("assetApproval", { ...g.assetApproval, notes: e.target.value })} />
            </div>
          </Card>
          <Card eyebrow="Audio" title="Voice configuration">
            <div className="space-y-3">
              <Field label="Provider">
                <select className="input" value={g.voiceConfig.provider ?? "none"} onChange={(e) => set("voiceConfig", { ...g.voiceConfig, provider: e.target.value as Guest["voiceConfig"]["provider"] })}>
                  <option value="none">None (text rehearsal)</option>
                  <option value="elevenlabs" disabled>ElevenLabs stock voice (Milestone 2 - not wired)</option>
                </select>
              </Field>
              <Field label="Voice kind">
                <select className="input" value={g.voiceConfig.kind ?? "stock"} onChange={(e) => set("voiceConfig", { ...g.voiceConfig, kind: e.target.value as Guest["voiceConfig"]["kind"] })}>
                  <option value="stock">Stock voice</option>
                  <option value="custom">Custom (requires documented consent)</option>
                </select>
              </Field>
              <p className="text-xs text-ivory-mute">No celebrity voice cloning. Custom voices require the provider&apos;s consent verification; this app will not bypass it.</p>
            </div>
          </Card>
          <Card eyebrow="History" title="Instruction versions">
            <ul className="max-h-72 space-y-2 overflow-auto text-xs">
              {versions.map((v) => (
                <li key={v.id} className="rounded border border-line bg-bg-elev p-2">
                  <div className="flex items-center justify-between"><span className="display text-sm text-amber-bright">v{v.version}</span><span className="text-ivory-mute">{fmtDate(v.createdAt)}</span></div>
                  <div className="mt-1 text-ivory-dim">{v.changeNote}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LedgerSection({ guestId, category, entries, onChange }: { guestId: string; category: (typeof ENTRY_CATEGORIES)[number]; entries: GuestEntry[]; onChange: () => Promise<void> }) {
  const meta = CATEGORY_META[category];
  const [text, setText] = useState("");
  const [passageId, setPassageId] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-bg-elev p-3">
      <div className="mb-2 flex items-center gap-2"><Badge tone={meta.tone}>{meta.label}</Badge><span className="text-xs text-ivory-mute">{meta.help}</span></div>
      <ul className="space-y-1.5">
        {entries.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 rounded bg-surface px-3 py-2 text-sm">
            <div>
              <div className="text-ivory">{e.text}</div>
              {(e.passageId || e.note) && <div className="mt-0.5 font-mono text-[11px] text-ivory-mute">{e.passageId}{e.note ? ` · ${e.note}` : ""}</div>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/api/guests/${guestId}/entries/${e.id}`, { method: "DELETE" }); await onChange(); }}>Remove</button>
          </li>
        ))}
        {entries.length === 0 && <li className="text-xs text-ivory-mute">None recorded.</li>}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          try {
            await api(`/api/guests/${guestId}/entries`, { method: "POST", json: { category, text, passageId: passageId || null } });
            setText("");
            setPassageId("");
            await onChange();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className="input" placeholder={`Add ${meta.label.toLowerCase().replace(/s$/, "")}…`} value={text} onChange={(e) => setText(e.target.value)} />
        <input className="input w-44 font-mono text-xs" placeholder="psg_… (optional)" value={passageId} onChange={(e) => setPassageId(e.target.value)} />
        <button className="btn btn-sm" disabled={busy || !text.trim()}>Add</button>
      </form>
    </div>
  );
}
