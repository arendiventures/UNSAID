import { NextResponse } from "next/server";
import { z } from "zod";
import { appConfig } from "@/lib/config/env";
import { SESSION_COOKIE, sessionValueFor } from "@/lib/auth";
import { readJson, route } from "@/lib/api";

export const POST = route(async (req: Request) => {
  const token = appConfig.accessToken;
  if (!token) return NextResponse.json({ ok: true, message: "No access token configured; local access does not require login." });
  const { token: supplied } = await readJson(req, z.object({ token: z.string().min(1).max(500) }));
  // Constant-time comparison on fixed-length digests.
  const [a, b] = await Promise.all([sessionValueFor(token), sessionValueFor(supplied)]);
  if (a !== b) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Invalid access token." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, a, { httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: 60 * 60 * 24 * 14 });
  return res;
});
