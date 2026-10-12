"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Card, Field } from "./ui";

/**
 * Microphone permission, device selection and a live level meter. The push-to-talk control
 * itself lives in the studio composer; this card reports whether it is available.
 */
export function DeviceSetup({ deviceId, onDeviceChange, pttAvailable, pttReason }: { deviceId: string; onDeviceChange: (id: string) => void; pttAvailable: boolean; pttReason: string }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const setDeviceId = onDeviceChange;
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied" | "unsupported">("unknown");
  const [level, setLevel] = useState(0);
  const [active, setActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  async function enable() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("unsupported");
      return;
    }
    try {
      stopMeter();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      setPermission("granted");
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audioinput"));
      setOutputs(all.filter((d) => d.kind === "audiooutput"));
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = ((buf[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setActive(true);
    } catch (e) {
      setPermission(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "unsupported");
    }
  }

  function stopMeter() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setActive(false);
    setLevel(0);
  }

  useEffect(() => () => stopMeter(), []);

  return (
    <Card eyebrow="Devices" title="Microphone setup" actions={<Badge tone={permission === "granted" ? "ok" : permission === "denied" ? "danger" : "default"}>{permission === "granted" ? "mic allowed" : permission === "denied" ? "mic blocked" : permission === "unsupported" ? "unsupported" : "not requested"}</Badge>}>
      <div className="space-y-3 text-sm">
        <Field label="Input device">
          <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={devices.length === 0}>
            <option value="">{devices.length ? "System default" : "Allow the microphone to list devices"}</option>
            {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 6)}`}</option>)}
          </select>
        </Field>
        {outputs.length > 0 && <p className="text-xs text-ivory-mute">{outputs.length} output device(s) detected. Use headphones so guest playback never feeds back into the microphone.</p>}
        <div className="flex items-center gap-3">
          <button className="btn btn-sm" onClick={active ? stopMeter : enable}>{active ? "Stop meter" : "Test microphone"}</button>
          <div className="h-2 flex-1 overflow-hidden rounded bg-bg-elev">
            <div className="h-full bg-gradient-to-r from-ok via-amber to-danger transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
        </div>
        <div className={`rounded border px-3 py-2 text-xs ${pttAvailable ? "border-ok/40 text-ok" : "border-line text-ivory-mute"}`}>{pttAvailable ? "Push-to-talk available: hold the button in the composer (or hold Space outside a text field)." : `Push-to-talk unavailable: ${pttReason}`}</div>
        <p className="text-xs text-ivory-mute">Recommended: wear headphones. Guest audio must never be routed back into the microphone input.</p>
      </div>
    </Card>
  );
}
