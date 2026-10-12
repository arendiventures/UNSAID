"use client";

import { useEffect, useRef, useState } from "react";
import { Wordmark } from "./Wordmark";

type PublicState = {
  episodeTitle: string;
  status: string;
  guestName: string;
  simulationLabel: string;
  guestBusy: boolean;
  latest: { id: string; seq: number; spokenText: string | null; completedAt: string | null; audioAssetId: string | null } | null;
  mode: "text" | "audio" | "avatar";
  visuals: { conceptAssetId: string | null; backdropAssetId: string | null; logoAssetId: string | null; mode: "static_image" };
};

/**
 * Clean audience capture view for OBS (browser source / window capture).
 * Contains only: guest visual, branding, the simulation label and optional captions.
 * It calls the audience-safe endpoint, which never returns producer data.
 */
export function CaptureView({ episodeId, captions, audio }: { episodeId: string; captions: boolean; audio: "off" | "guest" | "browser" }) {
  const [state, setState] = useState<PublicState | null>(null);
  const [offline, setOffline] = useState(false);
  const spokenRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/episodes/${episodeId}/public`, { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) throw new Error(String(res.status));
        const s = (await res.json()) as PublicState;
        setState(s);
        setOffline(false);
        if (s.latest && s.latest.id !== spokenRef.current) {
          const first = spokenRef.current === null;
          spokenRef.current = s.latest.id;
          if (!first) {
            if (audio === "guest" && s.latest.audioAssetId && audioRef.current) {
              audioRef.current.src = `/api/assets/${s.latest.audioAssetId}/file`;
              void audioRef.current.play().catch(() => undefined);
            } else if (audio === "browser" && s.latest.spokenText && "speechSynthesis" in window) {
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(new SpeechSynthesisUtterance(s.latest.spokenText));
            }
          }
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    void tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [episodeId, audio]);

  const v = state?.visuals;
  const img = v?.conceptAssetId ?? v?.backdropAssetId ?? null;
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-ivory">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${img}/file`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a120c_0%,_#000_70%)]" />
      )}
      <div className="absolute left-8 top-8">
        {v?.logoAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${v.logoAssetId}/file`} alt="UNSAID" className="h-20 w-auto drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]" />
        ) : (
          <Wordmark size="lg" />
        )}
      </div>
      <div className="absolute bottom-8 left-8 flex items-center gap-2">
        <span className="sim-label">{state?.simulationLabel ?? "AI SIMULATION"}</span>
        <span className="sim-label">Static image</span>
      </div>
      {captions && state?.latest?.spokenText && (
        <div className="absolute inset-x-0 bottom-24 flex justify-center px-16">
          <p className="max-w-4xl rounded-lg bg-black/70 px-6 py-4 text-center text-2xl leading-relaxed text-ivory backdrop-blur-sm">{state.latest.spokenText}</p>
        </div>
      )}
      <audio ref={audioRef} className="hidden" />
      {state?.guestBusy && <div className="pulse absolute bottom-10 right-10 h-4 w-4 rounded-full bg-amber" />}
      {offline && <div className="absolute right-8 top-8 rounded bg-black/70 px-3 py-1 text-xs text-danger">capture feed disconnected</div>}
      {state?.status === "ended" && <div className="absolute right-8 top-8 rounded bg-black/70 px-3 py-1 text-xs text-ivory-dim">session ended</div>}
    </div>
  );
}
