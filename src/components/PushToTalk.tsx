"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PttState = "idle" | "recording" | "uploading";

/**
 * Hold-to-record. Audio is captured with MediaRecorder from the selected input device and
 * handed to onClip on release. Nothing leaves the browser until the button is released.
 */
export function usePushToTalk(opts: { deviceId: string; enabled: boolean; onClip: (blob: Blob, mimeType: string, durationMs: number) => Promise<void>; onStateChange?: (s: PttState) => void }) {
  const [state, setStateRaw] = useState<PttState>("idle");
  const onStateChange = opts.onStateChange;
  const setState = useCallback(
    (s: PttState) => {
      setStateRaw(s);
      onStateChange?.(s);
    },
    [onStateChange],
  );
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    if (!opts.enabled || state !== "idle") return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: opts.deviceId ? { deviceId: { exact: opts.deviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const type = (rec.mimeType || mime || "audio/webm").split(";")[0]!;
        const blob = new Blob(chunksRef.current, { type });
        const durationMs = Date.now() - startedAt.current;
        stopTracks();
        if (durationMs < 300 || blob.size < 1000) {
          setState("idle");
          setError("Clip too short - hold the button while you speak.");
          return;
        }
        setState("uploading");
        try {
          await opts.onClip(blob, type, durationMs);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed");
        } finally {
          setState("idle");
        }
      };
      recRef.current = rec;
      startedAt.current = Date.now();
      rec.start();
      setState("recording");
    } catch (e) {
      stopTracks();
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access was denied." : e instanceof Error ? e.message : "Could not start recording");
      setState("idle");
    }
  }, [opts, state, setState]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === "recording") rec.stop();
    else stopTracks();
  }, []);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === "recording") {
      rec.ondataavailable = null;
      rec.onstop = () => stopTracks();
      rec.stop();
    } else stopTracks();
    chunksRef.current = [];
    setState("idle");
  }, [setState]);

  // Space bar as a hold-to-talk key when focus is not in a text field.
  useEffect(() => {
    if (!opts.enabled) return;
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isTyping()) {
        e.preventDefault();
        void start();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping()) {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [opts.enabled, start, stop]);

  useEffect(() => () => stopTracks(), []);

  return { state, error, start, stop, cancel };
}
