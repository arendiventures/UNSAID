"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Episode, EpisodeMode, Guest, Turn } from "@/lib/db/schema";
import { ANSWER_LENGTHS } from "@/lib/db/schema";
import type { ProviderInfo } from "@/lib/providers/types";
import { api } from "@/lib/client";
import { Badge, Card, Field, Notice, SimulationLabel, fmtDate } from "./ui";
import { ProducerPanel } from "./ProducerPanel";
import { DeviceSetup } from "./DeviceSetup";
import { usePushToTalk } from "./PushToTalk";

export type EpisodeBundle = { episode: Episode; guest: Guest; turns: Turn[]; busy: boolean; provider: ProviderInfo };
export type ModeAvailability = Record<EpisodeMode, { available: boolean; reason: string }>;

export type UiState = "idle" | "listening" | "transcribing" | "retrieving" | "generating" | "validating" | "speaking" | "interrupted" | "disconnected" | "failed" | "needs_review";

const STATE_META: Record<UiState, { label: string; tone: "default" | "amber" | "ok" | "warn" | "danger" | "info" }> = {
  idle: { label: "Idle", tone: "default" },
  listening: { label: "Listening", tone: "amber" },
  transcribing: { label: "Transcribing", tone: "amber" },
  retrieving: { label: "Retrieving", tone: "amber" },
  generating: { label: "Generating", tone: "amber" },
  validating: { label: "Validating", tone: "amber" },
  speaking: { label: "Speaking", tone: "ok" },
  interrupted: { label: "Interrupted", tone: "warn" },
  disconnected: { label: "Disconnected", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  needs_review: { label: "Needs review", tone: "warn" },
};

const PIPELINE: UiState[] = ["listening", "transcribing", "retrieving", "generating", "validating", "speaking"];
const MODE_LABEL: Record<EpisodeMode, string> = { text: "Text rehearsal", audio: "Live audio interview", avatar: "Live avatar interview" };

type Props = {
  guests: Guest[];
  providers: ProviderInfo[];
  defaultLlmId: string;
  conceptImages: Record<string, string>;
  backdropId: string | null;
  initialEpisode: EpisodeBundle | null;
  initialGuestId: string | null;
  modes: ModeAvailability;
  ttsConfigured: boolean;
};

export function InterviewStudio(props: Props) {
  const router = useRouter();
  const [bundle, setBundle] = useState<EpisodeBundle | null>(props.initialEpisode);
  const [guestId, setGuestId] = useState(props.initialEpisode?.guest.id ?? props.guests.find((g) => g.id === props.initialGuestId || g.slug === props.initialGuestId)?.id ?? props.guests[0]?.id ?? "");
  const [title, setTitle] = useState(props.initialEpisode?.episode.title ?? "");
  const [mode, setMode] = useState<EpisodeMode>(props.initialEpisode?.episode.mode ?? (props.modes.audio.available ? "audio" : "text"));
  const [llmId, setLlmId] = useState(props.initialEpisode?.episode.llmProvider ?? props.defaultLlmId);
  const [answerLength, setAnswerLength] = useState<string>(props.initialEpisode?.episode.answerLength ?? "");
  const [question, setQuestion] = useState("");
  const [ui, setUi] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(props.initialEpisode?.turns.at(-1)?.id ?? null);
  const [browserVoice, setBrowserVoice] = useState(false);
  const [guestVoice, setGuestVoice] = useState(props.ttsConfigured && (props.initialEpisode?.episode.mode ?? "text") === "audio");
  const [autoAsk, setAutoAsk] = useState(true);
  const [deviceId, setDeviceId] = useState("");
  const [notes, setNotes] = useState(props.initialEpisode?.episode.hostNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [speakingTurnId, setSpeakingTurnId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const notesTimer = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const episode = bundle?.episode ?? null;
  const guest = bundle?.guest ?? props.guests.find((g) => g.id === guestId) ?? null;
  const live = episode?.status === "live";
  const conceptId = guest ? props.conceptImages[guest.id] : undefined;
  const pttAvailable = props.modes.audio.available;

  const refresh = useCallback(async (): Promise<EpisodeBundle | null> => {
    if (!episode) return null;
    try {
      const b = await api<EpisodeBundle>(`/api/episodes/${episode.id}`);
      setBundle(b);
      setUi((s) => (s === "disconnected" ? "idle" : s));
      return b;
    } catch (e) {
      if (e instanceof TypeError) setUi("disconnected");
      return null;
    }
  }, [episode]);

  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const stopAllPlayback = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setSpeakingTurnId(null);
  }, []);

  const speakBrowser = useCallback(
    (text: string) => {
      if (!browserVoice || typeof window === "undefined" || !("speechSynthesis" in window)) return false;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.onend = () => setUi((s) => (s === "speaking" ? "idle" : s));
      u.onerror = () => setUi((s) => (s === "speaking" ? "idle" : s));
      setUi("speaking");
      window.speechSynthesis.speak(u);
      return true;
    },
    [browserVoice],
  );

  /** Synthesize once (server dedupes), then play the stored asset through the single audio element. */
  const playGuestAudio = useCallback(
    async (turn: Turn): Promise<boolean> => {
      try {
        let url = turn.audioAssetId ? `/api/assets/${turn.audioAssetId}/file` : null;
        if (!url) {
          setUi("speaking");
          const r = await api<{ url: string }>(`/api/turns/${turn.id}/speak`, { method: "POST", json: {} });
          url = r.url;
          await refresh();
        }
        const a = audioRef.current;
        if (!a) return false;
        a.src = url;
        setSpeakingTurnId(turn.id);
        setUi("speaking");
        a.onended = () => {
          setUi((s) => (s === "speaking" ? "idle" : s));
          setSpeakingTurnId(null);
        };
        a.onerror = () => {
          setUi("idle");
          setSpeakingTurnId(null);
          setError("Audio playback failed in this browser.");
        };
        await a.play();
        return true;
      } catch (e) {
        setUi("idle");
        setSpeakingTurnId(null);
        setError(e instanceof Error ? `Voice synthesis failed: ${e.message}` : "Voice synthesis failed");
        return false;
      }
    },
    [refresh],
  );

  async function startSession() {
    if (!guestId || !title.trim()) {
      setError("Pick a guest and name the episode first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ep = await api<Episode>("/api/episodes", { method: "POST", json: { guestId, title: title.trim(), mode, answerLength: answerLength || null, llmProvider: llmId } });
      await api(`/api/episodes/${ep.id}/start`, { method: "POST" });
      const b = await api<EpisodeBundle>(`/api/episodes/${ep.id}`);
      setBundle(b);
      setGuestVoice(props.ttsConfigured && mode === "audio");
      setUi("idle");
      router.replace(`/studio?episode=${ep.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session");
    } finally {
      setBusy(false);
    }
  }

  async function ask(q: string, extra: { inputMode?: "typed" | "voice"; transcriptMeta?: Record<string, unknown> | null } = {}) {
    if (!episode || !q.trim()) return;
    stopAllPlayback();
    setBusy(true);
    setError(null);
    setUi("retrieving");
    setQuestion("");
    pollRef.current = window.setInterval(async () => {
      const b = await refresh();
      const active = b?.turns.find((t) => ["queued", "retrieving", "generating", "validating"].includes(t.state));
      if (active) setUi(active.state as UiState);
    }, 600);
    try {
      const turn = await api<Turn>(`/api/episodes/${episode.id}/turns`, { method: "POST", json: { question: q, inputMode: extra.inputMode ?? "typed", llmId: episode.llmProvider, transcriptMeta: extra.transcriptMeta ?? null } });
      stopPolling();
      await refresh();
      setSelectedTurnId(turn.id);
      if (turn.state === "ready" && turn.spokenText) {
        if (guestVoice && props.ttsConfigured) {
          if (!(await playGuestAudio(turn))) setUi("idle");
        } else if (!speakBrowser(turn.spokenText)) setUi("idle");
      } else if (turn.state === "needs_review") setUi("needs_review");
      else if (turn.state === "interrupted") setUi("interrupted");
      else if (turn.state === "failed") {
        setUi("failed");
        setError(turn.error ?? "The provider failed. The session and transcript are intact.");
      }
    } catch (e) {
      stopPolling();
      await refresh();
      if (e instanceof TypeError) {
        setUi("disconnected");
        setError("Lost connection to the studio server. The session is persisted; reconnect and continue.");
      } else {
        setUi("failed");
        setError(e instanceof Error ? e.message : "Request failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const ptt = usePushToTalk({
    deviceId,
    enabled: !!live && pttAvailable && !busy,
    onStateChange: (s) => {
      if (s === "recording") setUi("listening");
      else if (s === "idle") setUi((prev) => (prev === "listening" ? "idle" : prev));
    },
    onClip: async (blob, mimeType, durationMs) => {
      if (!episode) return;
      setUi("transcribing");
      setError(null);
      const fd = new FormData();
      fd.set("audio", blob, "clip");
      fd.set("mimeType", mimeType);
      try {
        const r = await api<{ text: string; provider: string; model: string; durationMs: number; meta: Record<string, unknown> | null }>(`/api/episodes/${episode.id}/transcribe`, { method: "POST", body: fd });
        const meta = { provider: r.provider, model: r.model, transcribeMs: r.durationMs, clipMs: durationMs, ...(r.meta ?? {}) };
        if (!r.text) {
          setUi("idle");
          setError("Nothing was transcribed from that clip.");
          return;
        }
        if (autoAsk) await ask(r.text, { inputMode: "voice", transcriptMeta: meta });
        else {
          setQuestion(r.text);
          setUi("idle");
        }
      } catch (e) {
        setUi("failed");
        setError(e instanceof Error ? `Transcription failed: ${e.message}` : "Transcription failed");
        throw e;
      }
    },
  });

  async function stop() {
    stopAllPlayback();
    if (ptt.state === "recording") ptt.cancel();
    if (episode) {
      try {
        const r = await api<{ cancelled: number }>(`/api/episodes/${episode.id}/stop`, { method: "POST" });
        setUi(r.cancelled > 0 || ui === "speaking" ? "interrupted" : "idle");
      } catch {
        setUi("idle");
      }
      await refresh();
    } else setUi("idle");
  }

  async function endSession() {
    if (!episode) return;
    if (!confirm("End this session? The transcript is kept; you will not be able to ask further questions in it.")) return;
    stopAllPlayback();
    await api(`/api/episodes/${episode.id}/end`, { method: "POST" });
    await refresh();
    setUi("idle");
  }

  async function toggleReview(turn: Turn) {
    const note = turn.reviewFlag ? undefined : (window.prompt("Review note (optional)", turn.reviewNote || "") ?? undefined);
    await api(`/api/turns/${turn.id}`, { method: "PATCH", json: { reviewFlag: !turn.reviewFlag, reviewNote: note } });
    await refresh();
  }

  function saveNotes(v: string) {
    setNotes(v);
    if (!episode) return;
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => {
      api(`/api/episodes/${episode.id}`, { method: "PATCH", json: { hostNotes: v } }).catch(() => undefined);
    }, 600);
  }

  async function changeAnswerLength(v: string) {
    setAnswerLength(v);
    if (episode) {
      await api(`/api/episodes/${episode.id}`, { method: "PATCH", json: { answerLength: v || null } });
      await refresh();
    }
  }

  useEffect(() => () => stopPolling(), []);
  useEffect(() => {
    if (bundle?.busy && !pollRef.current) {
      pollRef.current = window.setInterval(async () => {
        const b = await refresh();
        if (b && !b.busy) {
          stopPolling();
          setUi("idle");
        }
      }, 800);
    }
  }, [bundle?.busy, refresh]);

  const turns = bundle?.turns ?? [];
  const selectedTurn = turns.find((t) => t.id === selectedTurnId) ?? turns.at(-1) ?? null;
  const providerInfo = bundle?.provider ?? props.providers.find((p) => p.id === llmId);
  const localMode = (providerInfo?.id ?? llmId) === "local-evidence-reader";
  const pttLabel = ptt.state === "recording" ? "Release to send" : ptt.state === "uploading" ? "Transcribing…" : "Hold to talk";

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <audio ref={audioRef} className="hidden" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Interview studio · {episode ? MODE_LABEL[episode.mode] : MODE_LABEL[mode]}</div>
          <h1 className="display text-4xl font-semibold">{episode ? episode.title : "New session"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StateBadge ui={ui} />
          {episode && (
            <>
              <Link href={`/capture/${episode.id}`} target="_blank" className="btn btn-sm">Open OBS capture view ↗</Link>
              <Link href={`/episodes/${episode.id}`} className="btn btn-sm">Episode record</Link>
            </>
          )}
        </div>
      </header>

      {localMode && (
        <Notice tone="warn">
          <strong>Offline evidence reader.</strong> No language model is configured, so answers are verbatim retrieved excerpts, not a persona simulation. Configure ANTHROPIC_API_KEY in Settings to run the simulation.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {ptt.error && <Notice tone="warn">{ptt.error}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          {!episode && (
            <Card eyebrow="Session" title="Set up a session">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Guest">
                  <select className="input" value={guestId} onChange={(e) => setGuestId(e.target.value)}>
                    {props.guests.map((g) => <option key={g.id} value={g.id}>{g.displayName} · {g.simulationLabel}</option>)}
                  </select>
                </Field>
                <Field label="Episode name"><input className="input" placeholder="e.g. Rehearsal 1 - opening questions" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <Field label="Mode" hint={props.modes[mode].available ? (mode === "audio" ? "Push-to-talk transcription and spoken answers via ElevenLabs." : "Typed questions, text answers. Optional browser voice for rehearsal.") : props.modes[mode].reason}>
                  <select className="input" value={mode} onChange={(e) => setMode(e.target.value as EpisodeMode)}>
                    {(["text", "audio", "avatar"] as EpisodeMode[]).map((m) => (
                      <option key={m} value={m} disabled={!props.modes[m].available}>{MODE_LABEL[m]}{props.modes[m].available ? "" : ` - unavailable (${props.modes[m].reason})`}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Language model">
                  <select className="input" value={llmId} onChange={(e) => setLlmId(e.target.value)}>
                    {props.providers.map((p) => <option key={p.id} value={p.id} disabled={!p.configured}>{p.name}{p.configured ? "" : " (not configured)"}</option>)}
                  </select>
                </Field>
                <Field label="Answer length (override)">
                  <select className="input" value={answerLength} onChange={(e) => setAnswerLength(e.target.value)}>
                    <option value="">Guest default</option>
                    {ANSWER_LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button className="btn btn-primary" disabled={busy || !guestId || !title.trim() || !props.modes[mode].available} onClick={startSession}>Start session</button>
                <span className="text-xs text-ivory-mute">Starting freezes the guest instructions (v{guest?.currentVersion}) and the research collection for this episode.</span>
              </div>
            </Card>
          )}

          <div className="card relative overflow-hidden">
            <div className="relative aspect-video w-full bg-black">
              {conceptId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/assets/${conceptId}/file`} alt="" className="h-full w-full object-cover" />
              ) : props.backdropId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/assets/${props.backdropId}/file`} alt="" className="h-full w-full object-cover opacity-80" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-ivory-mute">No guest visual registered. Add a concept image in Assets.</div>
              )}
              <div className="absolute left-4 top-4 flex gap-2">
                <SimulationLabel text={guest?.simulationLabel ?? "AI SIMULATION"} />
                <span className="sim-label">Static preview</span>
              </div>
              <div className="absolute right-4 top-4"><StateBadge ui={ui} /></div>
              {(ui === "speaking" || PIPELINE.includes(ui)) && <div className="pulse absolute bottom-4 right-4 h-3 w-3 rounded-full bg-amber" />}
              {selectedTurn?.state === "ready" && selectedTurn.spokenText && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-12">
                  <p className="max-w-3xl text-base leading-relaxed text-ivory drop-shadow">{selectedTurn.spokenText}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3 text-xs text-ivory-mute">
              <span>Still image. No lip-sync, no animation. Live avatar is Milestone 3.</span>
              <label className="ml-auto flex items-center gap-2" title={props.ttsConfigured ? "Answers are synthesized with the guest's selected stock voice (ElevenLabs) and stored once per turn." : "Needs ELEVENLABS_API_KEY"}>
                <input type="checkbox" checked={guestVoice} disabled={!props.ttsConfigured} onChange={(e) => { setGuestVoice(e.target.checked); if (e.target.checked) setBrowserVoice(false); }} />
                Guest voice (ElevenLabs stock voice){props.ttsConfigured ? "" : " - not configured"}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={browserVoice} disabled={guestVoice} onChange={(e) => setBrowserVoice(e.target.checked)} />
                Browser voice (system TTS, rehearsal only)
              </label>
            </div>
          </div>

          <Card eyebrow="Pipeline" title="Session state">
            <ol className="flex flex-wrap items-center gap-2 text-xs">
              {(["idle", ...PIPELINE] as UiState[]).map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={`badge ${ui === s ? `badge-${STATE_META[s].tone === "default" ? "amber" : STATE_META[s].tone}` : ""}`}>{STATE_META[s].label}</span>
                  {i < PIPELINE.length && <span className="text-ivory-mute">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-ivory-mute">{pttAvailable ? "Listening and transcribing use push-to-talk (ElevenLabs Scribe)." : `Listening and transcribing are unavailable: ${props.modes.audio.reason}`} Every answer is validated against retrieved passages before it can be shown or spoken; synthesis starts only after validation.</p>
          </Card>

          <Card eyebrow="Conversation" title="Live transcript" actions={episode && <Badge tone={episode.status === "live" ? "ok" : "default"}>{episode.status}</Badge>}>
            <div className="max-h-[48vh] space-y-3 overflow-auto pr-1">
              {turns.length === 0 && <p className="text-sm text-ivory-mute">{episode ? "No questions yet. Type one below or hold to talk." : "Start a session to begin."}</p>}
              {turns.map((t) => (
                <div key={t.id} className={`cursor-pointer rounded-lg border p-3 transition ${selectedTurn?.id === t.id ? "border-amber/60 bg-amber/5" : "border-line bg-bg-elev hover:border-line-strong"}`} onClick={() => setSelectedTurnId(t.id)}>
                  <div className="flex items-center justify-between text-xs text-ivory-mute">
                    <span>#{t.seq} · Host{t.inputMode === "voice" ? " (voice)" : ""} · {fmtDate(t.createdAt)}</span>
                    <div className="flex items-center gap-1.5">
                      <TurnStateBadge state={t.state} />
                      {t.reviewFlag && <Badge tone="warn">Marked</Badge>}
                      {t.state === "ready" && (t.audioAssetId || props.ttsConfigured) && (
                        <button className="btn btn-ghost btn-sm" disabled={speakingTurnId === t.id} onClick={(e) => { e.stopPropagation(); stopAllPlayback(); void playGuestAudio(t); }} title={t.audioAssetId ? "Replay stored audio" : "Synthesize with ElevenLabs (spends characters) and play"}>
                          {speakingTurnId === t.id ? "Playing…" : t.audioAssetId ? "Play" : "Generate voice"}
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void toggleReview(t); }}>{t.reviewFlag ? "Unmark" : "Mark for review"}</button>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-ivory">{t.questionText}</p>
                  <div className="mt-2 border-l-2 border-amber/50 pl-3">
                    <div className="text-xs text-ivory-mute">{guest?.displayName} · {guest?.simulationLabel}{t.audioAssetId ? " · audio stored" : ""}</div>
                    {t.spokenText ? <p className={`mt-0.5 text-sm ${t.state === "ready" ? "text-ivory-dim" : "text-warn"}`}>{t.spokenText}</p> : <p className="mt-0.5 text-sm italic text-ivory-mute">{t.state === "failed" ? `No answer: ${t.error}` : t.state === "interrupted" ? "Stopped before an answer was produced." : t.error ?? "…"}</p>}
                    {t.state === "needs_review" && <p className="mt-1 text-xs text-warn">Held for review - not shown in the capture view. See the producer panel.</p>}
                  </div>
                </div>
              ))}
            </div>
            <form
              className="mt-4 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <textarea
                className="input min-h-[72px]"
                placeholder={live ? (pttAvailable ? "Type the host question, or hold the talk button…" : "Type the host question…") : episode ? "Session ended." : "Start a session first."}
                value={question}
                disabled={!live || busy}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
              />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className={`btn ${ptt.state === "recording" ? "btn-danger pulse" : "btn-primary"}`}
                  disabled={!live || !pttAvailable || busy || ptt.state === "uploading"}
                  title={pttAvailable ? "Hold to record; release to transcribe. Space also works outside text fields." : props.modes.audio.reason}
                  onMouseDown={(e) => { e.preventDefault(); void ptt.start(); }}
                  onMouseUp={ptt.stop}
                  onMouseLeave={() => { if (ptt.state === "recording") ptt.stop(); }}
                  onTouchStart={(e) => { e.preventDefault(); void ptt.start(); }}
                  onTouchEnd={ptt.stop}
                >
                  {pttLabel}
                </button>
                <button className="btn" disabled={!live || busy || !question.trim()}>Ask (typed)</button>
                <button type="button" className="btn btn-danger" disabled={!episode || (!busy && ui !== "speaking" && ptt.state !== "recording")} onClick={stop}>Stop guest</button>
              </div>
            </form>
            {episode && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ivory-mute">
                <span>Provider: {providerInfo?.name} · {episode.llmModel ?? "-"} · guest v{episode.guestVersion} · {episode.researchSnapshot?.sourceIds?.length ?? 0} sources in snapshot</span>
                <div className="flex items-center gap-3">
                  {pttAvailable && (
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={autoAsk} onChange={(e) => setAutoAsk(e.target.checked)} /> Ask immediately after transcription</label>
                  )}
                  {live ? <button className="btn btn-ghost btn-sm" onClick={endSession}>End session</button> : <Link href="/studio" className="btn btn-ghost btn-sm">New session</Link>}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <ProducerPanel turn={selectedTurn} />
          <Card eyebrow="Host" title="Question notes">
            <textarea className="input min-h-28 text-sm" placeholder="Running order, follow-ups, things to push on…" value={notes} onChange={(e) => saveNotes(e.target.value)} disabled={!episode} />
            <div className="mt-3">
              <Field label="Answer length">
                <select className="input" value={answerLength} onChange={(e) => void changeAnswerLength(e.target.value)} disabled={!!episode && episode.status === "ended"}>
                  <option value="">Guest default ({guest?.answerLength ?? "medium"})</option>
                  {ANSWER_LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </div>
          </Card>
          <DeviceSetup deviceId={deviceId} onDeviceChange={setDeviceId} pttAvailable={pttAvailable} pttReason={props.modes.audio.reason} />
        </div>
      </div>
    </div>
  );
}

export function StateBadge({ ui }: { ui: UiState }) {
  const m = STATE_META[ui];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function TurnStateBadge({ state }: { state: Turn["state"] }) {
  const tone = state === "ready" ? "ok" : state === "needs_review" || state === "interrupted" ? "warn" : state === "failed" ? "danger" : "amber";
  return <Badge tone={tone}>{state.replace(/_/g, " ")}</Badge>;
}
