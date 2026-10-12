"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Episode, Guest, Turn } from "@/lib/db/schema";
import { api } from "@/lib/client";
import { Badge, Notice, SimulationLabel } from "./ui";
import { Wordmark } from "./Wordmark";
import { usePushToTalk } from "./PushToTalk";
import { StateBadge, TurnStateBadge, type UiState } from "./InterviewStudio";

type Bundle = { episode: Episode; turns: Turn[]; busy: boolean };

// A silent MP3 frame used to unlock audio playback on iOS inside the first tap.
const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInluyiIiFsuBMtVuo0gYlt/E0zv1u/g3/tfiAA==";

/**
 * Phone-sized host remote: hold to talk, read the answer, stop, end. No producer panel,
 * no research tools; those stay on the desktop studio.
 */
export function RemoteStudio({ episode: initialEpisode, guest, initialTurns, conceptAssetId, pttAvailable, pttReason, ttsConfigured }: { episode: Episode; guest: Guest; initialTurns: Turn[]; conceptAssetId: string | null; pttAvailable: boolean; pttReason: string; ttsConfigured: boolean }) {
  const [episode, setEpisode] = useState(initialEpisode);
  const [turns, setTurns] = useState(initialTurns);
  const [ui, setUi] = useState<UiState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [showTyped, setShowTyped] = useState(!pttAvailable);
  const [guestVoice, setGuestVoice] = useState(ttsConfigured && initialEpisode.mode === "audio");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlocked = useRef(false);
  const pollRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const live = episode.status === "live";

  const refresh = useCallback(async () => {
    try {
      const b = await api<Bundle>(`/api/episodes/${episode.id}`);
      setEpisode(b.episode);
      setTurns(b.turns);
      setUi((s) => (s === "disconnected" ? "idle" : s));
      return b;
    } catch (e) {
      if (e instanceof TypeError) setUi("disconnected");
      return null;
    }
  }, [episode.id]);

  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  };

  /** Must run inside a user gesture on iOS so later programmatic playback is allowed. */
  const unlockAudio = () => {
    const a = audioRef.current;
    if (!a || unlocked.current) return;
    a.src = SILENT_MP3;
    a.play().then(() => { unlocked.current = true; }).catch(() => undefined);
  };

  const stopPlayback = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
  }, []);

  const playTurn = useCallback(
    async (turn: Turn) => {
      try {
        let url = turn.audioAssetId ? `/api/assets/${turn.audioAssetId}/file` : null;
        if (!url) {
          setUi("speaking");
          url = (await api<{ url: string }>(`/api/turns/${turn.id}/speak`, { method: "POST", json: {} })).url;
          await refresh();
        }
        const a = audioRef.current;
        if (!a) return;
        a.src = url;
        a.onended = () => setUi((s) => (s === "speaking" ? "idle" : s));
        a.onerror = () => setUi("idle");
        setUi("speaking");
        await a.play();
      } catch (e) {
        setUi("idle");
        setError(e instanceof Error ? `Voice: ${e.message}` : "Voice synthesis failed");
      }
    },
    [refresh],
  );

  const ask = useCallback(
    async (q: string, extra: { inputMode?: "typed" | "voice"; transcriptMeta?: Record<string, unknown> } = {}) => {
      if (!q.trim()) return;
      stopPlayback();
      setBusy(true);
      setError(null);
      setUi("retrieving");
      setTyped("");
      pollRef.current = window.setInterval(async () => {
        const b = await refresh();
        const active = b?.turns.find((t) => ["queued", "retrieving", "generating", "validating"].includes(t.state));
        if (active) setUi(active.state as UiState);
      }, 600);
      try {
        const turn = await api<Turn>(`/api/episodes/${episode.id}/turns`, { method: "POST", json: { question: q, inputMode: extra.inputMode ?? "typed", transcriptMeta: extra.transcriptMeta ?? null } });
        stopPolling();
        await refresh();
        if (turn.state === "ready" && turn.spokenText && guestVoice) await playTurn(turn);
        else if (turn.state === "ready") setUi("idle");
        else if (turn.state === "needs_review") setUi("needs_review");
        else if (turn.state === "interrupted") setUi("interrupted");
        else {
          setUi("failed");
          setError(turn.error ?? "The provider failed. The session is intact.");
        }
      } catch (e) {
        stopPolling();
        await refresh();
        setUi(e instanceof TypeError ? "disconnected" : "failed");
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(false);
      }
    },
    [episode.id, guestVoice, playTurn, refresh, stopPlayback],
  );

  const ptt = usePushToTalk({
    deviceId: "",
    enabled: live && pttAvailable && !busy,
    onStateChange: (s) => {
      if (s === "recording") setUi("listening");
      else if (s === "idle") setUi((prev) => (prev === "listening" ? "idle" : prev));
    },
    onClip: async (blob, mimeType, durationMs) => {
      setUi("transcribing");
      const fd = new FormData();
      fd.set("audio", blob, "clip");
      fd.set("mimeType", mimeType);
      const r = await api<{ text: string; provider: string; model: string; durationMs: number; meta: Record<string, unknown> | null }>(`/api/episodes/${episode.id}/transcribe`, { method: "POST", body: fd });
      if (!r.text) {
        setUi("idle");
        setError("Nothing was transcribed. Try again, closer to the microphone.");
        return;
      }
      await ask(r.text, { inputMode: "voice", transcriptMeta: { provider: r.provider, model: r.model, transcribeMs: r.durationMs, clipMs: durationMs, ...(r.meta ?? {}) } });
    },
  });

  async function stop() {
    stopPlayback();
    if (ptt.state === "recording") ptt.cancel();
    try {
      await api(`/api/episodes/${episode.id}/stop`, { method: "POST" });
    } catch {
      /* session persists regardless */
    }
    setUi("interrupted");
    await refresh();
    window.setTimeout(() => setUi((s) => (s === "interrupted" ? "idle" : s)), 1500);
  }

  async function endSession() {
    if (!confirm("End this session?")) return;
    stopPlayback();
    await api(`/api/episodes/${episode.id}/end`, { method: "POST" });
    await refresh();
  }

  useEffect(() => () => stopPolling(), []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns.length]);

  const latest = turns.at(-1) ?? null;
  const talkLabel = ptt.state === "recording" ? "Release to send" : ptt.state === "uploading" ? "Transcribing…" : busy ? "Working…" : "Hold to talk";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col gap-3">
      <audio ref={audioRef} className="hidden" playsInline />
      <header className="flex items-center justify-between">
        <Link href="/remote"><Wordmark size="sm" subtitle={false} /></Link>
        <div className="flex items-center gap-2">
          <StateBadge ui={ui} />
          <Badge tone={live ? "ok" : "default"}>{episode.status}</Badge>
        </div>
      </header>
      <div className="relative overflow-hidden rounded-lg border border-line bg-black">
        {conceptAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${conceptAssetId}/file`} alt="" className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-xs text-ivory-mute">{guest.displayName}</div>
        )}
        <div className="absolute left-2 top-2 flex gap-1"><SimulationLabel text={guest.simulationLabel} /><span className="sim-label">Static</span></div>
      </div>
      <div className="text-xs text-ivory-mute">{episode.title} · {guest.displayName}</div>
      {error && <Notice tone="danger">{error}</Notice>}
      {ptt.error && <Notice tone="warn">{ptt.error}</Notice>}

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-auto rounded-lg border border-line bg-bg-elev p-3">
        {turns.length === 0 && <p className="text-sm text-ivory-mute">{live ? (pttAvailable ? "Hold the button and ask your first question." : "Type your first question.") : "Session ended."}</p>}
        {turns.map((t) => (
          <div key={t.id} className={`rounded-md border p-2 ${t.id === latest?.id ? "border-amber/50 bg-amber/5" : "border-line"}`}>
            <div className="flex items-center justify-between text-[11px] text-ivory-mute"><span>#{t.seq} host</span><TurnStateBadge state={t.state} /></div>
            <p className="text-sm text-ivory">{t.questionText}</p>
            {t.spokenText ? <p className={`mt-1 border-l-2 border-amber/50 pl-2 text-sm ${t.state === "ready" ? "text-ivory-dim" : "text-warn"}`}>{t.spokenText}</p> : <p className="mt-1 text-xs italic text-ivory-mute">{t.error ?? "…"}</p>}
            {t.state === "needs_review" && <p className="mt-1 text-[11px] text-warn">Held for producer review; not on air.</p>}
            {t.state === "ready" && (t.audioAssetId || ttsConfigured) && (
              <button className="btn btn-ghost btn-sm mt-1" onClick={() => { unlockAudio(); void playTurn(t); }}>{t.audioAssetId ? "Play" : "Generate voice"}</button>
            )}
          </div>
        ))}
      </div>

      {live && (
        <div className="space-y-2">
          {pttAvailable && (
            <button
              type="button"
              className={`btn w-full py-6 text-lg ${ptt.state === "recording" ? "btn-danger pulse" : "btn-primary"}`}
              disabled={busy || ptt.state === "uploading"}
              onTouchStart={(e) => { e.preventDefault(); unlockAudio(); void ptt.start(); }}
              onTouchEnd={(e) => { e.preventDefault(); ptt.stop(); }}
              onTouchCancel={() => ptt.cancel()}
              onMouseDown={(e) => { e.preventDefault(); unlockAudio(); void ptt.start(); }}
              onMouseUp={ptt.stop}
              onMouseLeave={() => { if (ptt.state === "recording") ptt.stop(); }}
            >
              {talkLabel}
            </button>
          )}
          {!pttAvailable && <p className="text-xs text-ivory-mute">Voice input unavailable: {pttReason}</p>}
          {showTyped && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); unlockAudio(); void ask(typed); }}>
              <input className="input" placeholder="Type a question" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} />
              <button className="btn btn-sm" disabled={busy || !typed.trim()}>Ask</button>
            </form>
          )}
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-danger flex-1" disabled={!busy && ui !== "speaking" && ptt.state !== "recording"} onClick={stop}>Stop guest</button>
            {pttAvailable && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTyped((v) => !v)}>{showTyped ? "Hide typing" : "Type instead"}</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={endSession}>End</button>
          </div>
          {ttsConfigured && (
            <label className="flex items-center gap-2 text-xs text-ivory-mute"><input type="checkbox" checked={guestVoice} onChange={(e) => setGuestVoice(e.target.checked)} /> Play guest voice on this phone (use headphones)</label>
          )}
        </div>
      )}
      {!live && <Link href="/remote" className="btn w-full">Back to sessions</Link>}
    </div>
  );
}
