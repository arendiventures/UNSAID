import type { ReactNode } from "react";

export function Badge({ tone = "default", children, title }: { tone?: "default" | "amber" | "ok" | "warn" | "danger" | "info"; children: ReactNode; title?: string }) {
  const cls = tone === "default" ? "" : `badge-${tone}`;
  return (
    <span className={`badge ${cls}`} title={title}>
      {children}
    </span>
  );
}

export function Card({ title, eyebrow, actions, children, className = "" }: { title?: ReactNode; eyebrow?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || eyebrow || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="display text-xl font-semibold text-ivory">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, inline = false }: { label: string; hint?: string; children: ReactNode; inline?: boolean }) {
  return (
    <label className={`block ${inline ? "flex items-center gap-3" : ""}`}>
      <span className="eyebrow mb-1.5 block text-ivory-dim">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ivory-mute">{hint}</span>}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
      <div className="display text-lg text-ivory-dim">{title}</div>
      {children && <div className="mt-2 text-sm text-ivory-mute">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  const map = {
    info: "border-info/40 bg-info/5 text-ivory",
    warn: "border-warn/50 bg-warn/5 text-ivory",
    danger: "border-danger/50 bg-danger/5 text-ivory",
    ok: "border-ok/50 bg-ok/5 text-ivory",
  } as const;
  return <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${map[tone]}`}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className="display mt-1 text-2xl font-semibold text-ivory">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ivory-mute">{sub}</div>}
    </div>
  );
}

export function SimulationLabel({ text = "AI SIMULATION", className = "" }: { text?: string; className?: string }) {
  return <span className={`sim-label ${className}`}>{text}</span>;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
