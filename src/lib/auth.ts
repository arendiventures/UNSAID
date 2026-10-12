import { appConfig } from "@/lib/config/env";

export const SESSION_COOKIE = "unsaid_session";

export async function sessionValueFor(token: string): Promise<string> {
  const data = new TextEncoder().encode(`unsaid:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const h = host.split(":")[0]?.toLowerCase() ?? "";
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1";
}

export function authRequired(): boolean {
  return appConfig.accessToken !== null;
}
