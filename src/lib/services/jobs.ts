import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs, type Job } from "@/lib/db/schema";
import { newId, nowIso } from "@/lib/ids";

/**
 * Minimal durable job ledger for paid asynchronous work (speech synthesis today, avatar
 * video later). Real states only: queued → running → completed | failed | cancelled.
 * An idempotency key guarantees one paid request per logical unit of work.
 */
export function claimJob(db: Db, input: { type: string; idempotencyKey: string; provider?: string; input?: Record<string, unknown>; timeoutMs?: number; maxAttempts?: number }): { job: Job; created: boolean } {
  const existing = db.select().from(jobs).where(eq(jobs.idempotencyKey, input.idempotencyKey)).get();
  if (existing) {
    // A failed job may be retried (bounded); anything else is returned as-is.
    if (existing.status === "failed" && existing.attempts < existing.maxAttempts) {
      db.update(jobs).set({ status: "queued", error: null, updatedAt: nowIso() }).where(eq(jobs.id, existing.id)).run();
      return { job: db.select().from(jobs).where(eq(jobs.id, existing.id)).get()!, created: false };
    }
    return { job: existing, created: false };
  }
  const id = newId("job");
  const now = nowIso();
  db.insert(jobs)
    .values({ id, type: input.type, status: "queued", provider: input.provider ?? null, idempotencyKey: input.idempotencyKey, input: input.input ?? {}, attempts: 0, maxAttempts: input.maxAttempts ?? 2, timeoutMs: input.timeoutMs ?? 120_000, createdAt: now, updatedAt: now })
    .run();
  return { job: db.select().from(jobs).where(eq(jobs.id, id)).get()!, created: true };
}

export function markRunning(db: Db, id: string): void {
  const now = nowIso();
  const j = db.select().from(jobs).where(eq(jobs.id, id)).get()!;
  db.update(jobs).set({ status: "running", attempts: j.attempts + 1, startedAt: j.startedAt ?? now, updatedAt: now, error: null }).where(eq(jobs.id, id)).run();
}

export function markCompleted(db: Db, id: string, result: Record<string, unknown>): void {
  const now = nowIso();
  db.update(jobs).set({ status: "completed", result, finishedAt: now, updatedAt: now }).where(eq(jobs.id, id)).run();
}

export function markFailed(db: Db, id: string, error: string): void {
  const now = nowIso();
  db.update(jobs).set({ status: "failed", error, finishedAt: now, updatedAt: now }).where(eq(jobs.id, id)).run();
}

export function markCancelled(db: Db, id: string): void {
  const now = nowIso();
  db.update(jobs).set({ status: "cancelled", finishedAt: now, updatedAt: now }).where(eq(jobs.id, id)).run();
}

export function getJob(db: Db, id: string): Job | undefined {
  return db.select().from(jobs).where(eq(jobs.id, id)).get();
}

/** Run work under a job with a hard timeout; the job row reflects the real outcome. */
export async function runJob<T extends Record<string, unknown>>(db: Db, job: Job, work: (signal: AbortSignal) => Promise<T>): Promise<{ ok: true; result: T } | { ok: false; error: string; cancelled: boolean }> {
  markRunning(db, job.id);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), job.timeoutMs);
  try {
    const result = await work(ctrl.signal);
    markCompleted(db, job.id, result);
    return { ok: true, result };
  } catch (err) {
    const timedOut = ctrl.signal.aborted;
    const message = timedOut ? `Timed out after ${Math.round(job.timeoutMs / 1000)}s.` : err instanceof Error ? err.message : "Unknown error";
    markFailed(db, job.id, message);
    return { ok: false, error: message, cancelled: false };
  } finally {
    clearTimeout(timer);
  }
}
