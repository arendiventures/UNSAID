import path from "node:path";

/**
 * Central environment access. Values are never logged; only presence is reported.
 * Keep this file free of provider SDK imports so it can be used in tests and scripts.
 */

export const PROVIDER_ENV_VARS = {
  anthropic: ["ANTHROPIC_API_KEY"],
  elevenlabs: ["ELEVENLABS_API_KEY"],
  tavus: ["TAVUS_API_KEY"],
  heygen: ["HEYGEN_API_KEY"],
} as const;

export type ProviderKey = keyof typeof PROVIDER_ENV_VARS;

export function isSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export function missingVars(provider: ProviderKey): string[] {
  return PROVIDER_ENV_VARS[provider].filter((n) => !isSet(n));
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function storageDir(): string {
  const raw = process.env.UNSAID_STORAGE_DIR?.trim() || "./storage";
  return path.resolve(process.cwd(), raw);
}

export function dbPath(): string {
  const raw = process.env.UNSAID_DB_PATH?.trim();
  return raw ? path.resolve(process.cwd(), raw) : path.join(storageDir(), "db", "unsaid.sqlite");
}

export const appConfig = {
  get maxUploadBytes() {
    return intEnv("UNSAID_MAX_UPLOAD_MB", 25) * 1024 * 1024;
  },
  get llmModel() {
    return process.env.UNSAID_LLM_MODEL?.trim() || "claude-opus-5-5";
  },
  get accessToken() {
    const t = process.env.STUDIO_ACCESS_TOKEN?.trim();
    return t && t.length > 0 ? t : null;
  },
};

/** Redact anything that looks like a credential before it reaches a log line. */
export function redactSecrets(input: string): string {
  let out = input;
  for (const names of Object.values(PROVIDER_ENV_VARS)) {
    for (const n of names) {
      const v = process.env[n];
      if (v && v.length >= 8) out = out.split(v).join(`[${n}]`);
    }
  }
  const tok = process.env.STUDIO_ACCESS_TOKEN;
  if (tok && tok.length >= 8) out = out.split(tok).join("[STUDIO_ACCESS_TOKEN]");
  // Generic patterns: sk-..., Bearer tokens
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{8,})/g, "sk-[redacted]");
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/g, "$1[redacted]");
  return out;
}
