import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { EngineError } from "@/lib/engine/run";
import { redactSecrets } from "@/lib/config/env";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new EngineError("Request body must be JSON.", 400);
  }
  return schema.parse(body);
}

/** Wrap a route handler: typed errors become clean JSON, secrets never reach the response or log. */
export function route<Args extends unknown[]>(fn: (...args: Args) => Promise<Response> | Response) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof EngineError) return fail(err.message, err.status);
      if (err instanceof ZodError) return fail("Validation failed.", 422, { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
      const message = err instanceof Error ? redactSecrets(err.message) : "Unexpected error";
      console.error("[api]", redactSecrets(err instanceof Error ? (err.stack ?? err.message) : String(err)));
      return fail(message, 500);
    }
  };
}

export type RouteCtx<P extends Record<string, string>> = { params: Promise<P> };
