import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsSttAdapter } from "@/lib/providers/stt/elevenlabs";
import { ElevenLabsTtsAdapter } from "@/lib/providers/tts/elevenlabs";
import { __setElevenLabsClientForTests } from "@/lib/providers/elevenlabs/client";
import { openMemoryDatabase } from "@/lib/db/client";
import { createGuest } from "@/lib/services/guests";
import { createEpisode, startEpisode } from "@/lib/services/episodes";
import { speakTurn } from "@/lib/services/speech";
import { turns, jobs } from "@/lib/db/schema";
import type { TtsAdapter, VoiceOption } from "@/lib/providers/types";

process.env.UNSAID_STORAGE_DIR = "/tmp/claude-0/-home-user-UNSAID/6b284b05-0535-5b11-981b-a1e5d1af0449/scratchpad/test-storage";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** Stub the global fetch the SDK transport uses; capture requests, return canned responses. */
function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const h: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (h[k.toLowerCase()] = v));
    const call: Call = { url, method: init?.method ?? "GET", headers: h, body: init?.body };
    calls.push(call);
    return handler(call);
  });
  return calls;
}

describe("ElevenLabs adapters (transport stubbed)", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key-not-real";
    __setElevenLabsClientForTests(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ELEVENLABS_API_KEY;
    __setElevenLabsClientForTests(null);
  });

  it("report not configured without the key and name the variable", () => {
    delete process.env.ELEVENLABS_API_KEY;
    const stt = new ElevenLabsSttAdapter().info();
    const tts = new ElevenLabsTtsAdapter().info();
    expect(stt.configured).toBe(false);
    expect(stt.missingEnv).toEqual(["ELEVENLABS_API_KEY"]);
    expect(tts.configured).toBe(false);
  });

  it("STT posts multipart to /v1/speech-to-text with scribe_v2 and the api key header", async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ language_code: "en", language_probability: 0.99, text: " Why did you stay? ", words: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const r = await new ElevenLabsSttAdapter().transcribe(Buffer.from("fake-audio-bytes"), "audio/webm");
    expect(r.text).toBe("Why did you stay?");
    expect(r.raw?.languageCode).toBe("en");
    expect(calls.length).toBe(1);
    const c = calls[0]!;
    expect(c.method).toBe("POST");
    expect(c.url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(c.headers["xi-api-key"]).toBe("test-key-not-real");
    expect(c.body).toBeInstanceOf(FormData);
    const fd = c.body as FormData;
    expect(fd.get("model_id")).toBe("scribe_v2");
    expect(fd.get("file")).toBeInstanceOf(Blob);
  });

  it("STT maps a 401 to a clear non-retryable error", async () => {
    stubFetch(() => new Response(JSON.stringify({ detail: { status: "invalid_api_key", message: "bad" } }), { status: 401, headers: { "content-type": "application/json" } }));
    await expect(new ElevenLabsSttAdapter().transcribe(Buffer.from("x"), "audio/webm")).rejects.toMatchObject({ message: expect.stringMatching(/401/), retryable: false });
  });

  it("TTS posts JSON to /v1/text-to-speech/{voice} with output_format mp3_44100_128 and returns audio bytes", async () => {
    const calls = stubFetch(() => new Response(new Uint8Array([73, 68, 51, 1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const r = await new ElevenLabsTtsAdapter().synthesize("Hello there.", "voice_abc");
    expect(r.mimeType).toBe("audio/mpeg");
    expect(r.audio.length).toBe(6);
    const c = calls[0]!;
    expect(c.method).toBe("POST");
    expect(c.url).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/voice_abc\?/);
    expect(c.url).toContain("output_format=mp3_44100_128");
    const body = JSON.parse(String(c.body)) as Record<string, unknown>;
    expect(body.text).toBe("Hello there.");
    expect(body.model_id).toBe("eleven_multilingual_v2");
  });

  it("TTS lists voices with stock flag from /v2/voices", async () => {
    stubFetch(() => new Response(JSON.stringify({ voices: [{ voice_id: "v1", name: "Stock A", category: "premade", labels: { accent: "british" }, preview_url: "https://example.invalid/a.mp3" }, { voice_id: "v2", name: "Clone", category: "cloned", labels: {} }], has_more: false, total_count: 2 }), { status: 200, headers: { "content-type": "application/json" } }));
    const voices = await new ElevenLabsTtsAdapter().listVoices(true);
    expect(voices.map((v) => [v.voiceId, v.stock])).toEqual([["v1", true], ["v2", false]]);
  });

  it("connection test reports plan usage from /v1/user", async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ user_id: "u", subscription: { tier: "creator", character_count: 1200, character_limit: 100000, status: "active", can_use_instant_voice_cloning: false, can_extend_character_limit: false, allowed_to_extend_character_limit: false, voice_slots_used: 0, professional_voice_slots_used: 0, voice_limit: 10, max_voice_add_edits: 0, voice_add_edit_counter: 0, professional_voice_limit: 0, can_extend_voice_limit: false, can_use_professional_voice_cloning: false, currency: "usd", billing_period: "monthly_period", character_refresh_period: "monthly_period", max_character_limit_extension: 0, max_credit_limit_extension: 0, next_character_count_reset_unix: 1760000000, professional_voice_slots_used_in_workspace: 0, current_overage: { amount: "0", currency: "usd" } }, is_new_user: false, can_use_delayed_payment_methods: false, is_onboarding_completed: true, is_onboarding_checklist_completed: true, created_at: 1700000000, seat_type: "admin" }), { status: 200, headers: { "content-type": "application/json" } }));
    const r = await new ElevenLabsSttAdapter().test();
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/creator/);
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/user");
  });
});

describe("speakTurn: synthesize once, store once", () => {
  const { db } = openMemoryDatabase();
  const fakeVoices: VoiceOption[] = [{ voiceId: "stock1", name: "Stock", category: "premade", labels: {}, previewUrl: null, stock: true }, { voiceId: "clone1", name: "Clone", category: "cloned", labels: {}, previewUrl: null, stock: false }];
  let calls = 0;
  const fakeTts: TtsAdapter = {
    id: "fake-tts",
    info: () => ({ id: "fake-tts", category: "tts", name: "fake", implemented: true, configured: true, missingEnv: [], selection: {}, capabilities: [], notes: [] }),
    test: async () => ({ ok: true, message: "", testedAt: "" }),
    listVoices: async () => fakeVoices,
    synthesize: async () => {
      calls++;
      return { audio: Buffer.from([1, 2, 3, 4]), mimeType: "audio/mpeg" };
    },
  };
  const guest = createGuest(db, { displayName: "Synthetic Speaker", simulationLabel: "AI SIMULATION", status: "draft", bioSummary: "", bioSources: [], researchStatus: "not_started", knowledgeCutoff: "", perspective: "retrospective", perspectiveNotes: "", speakingStyle: "", personalityInterpretations: "", answerLength: "medium", voiceConfig: { provider: "elevenlabs", voiceId: "stock1", kind: "stock", consentStatus: "not_applicable" }, avatarConfig: { mode: "static_image", provider: "none" }, assetApproval: { status: "pending" } });
  const ep = startEpisode(db, createEpisode(db, { guestId: guest.id, title: "t", mode: "text" }).id);
  const now = new Date().toISOString();
  db.insert(turns).values({ id: "trn_ready", episodeId: ep.id, seq: 1, questionText: "q", state: "ready", spokenText: "A validated answer.", createdAt: now }).run();
  db.insert(turns).values({ id: "trn_review", episodeId: ep.id, seq: 2, questionText: "q", state: "needs_review", spokenText: "Unvalidated.", createdAt: now }).run();

  it("synthesizes a ready turn, stores the asset and links it", async () => {
    const r = await speakTurn(db, "trn_ready", fakeTts);
    expect(r.cached).toBe(false);
    expect(r.asset.mimeType).toBe("audio/mpeg");
    expect(calls).toBe(1);
    const job = db.select().from(jobs).all().find((j) => j.idempotencyKey === "tts:trn_ready");
    expect(job?.status).toBe("completed");
  });
  it("second call returns the stored audio without a new paid request", async () => {
    const r = await speakTurn(db, "trn_ready", fakeTts);
    expect(r.cached).toBe(true);
    expect(calls).toBe(1);
  });
  it("refuses unvalidated turns and cloned voices without consent", async () => {
    await expect(speakTurn(db, "trn_review", fakeTts)).rejects.toMatchObject({ status: 409 });
    db.insert(turns).values({ id: "trn_ready2", episodeId: ep.id, seq: 3, questionText: "q", state: "ready", spokenText: "Another.", createdAt: now }).run();
    await expect(speakTurn(db, "trn_ready2", fakeTts, { voiceId: "clone1" })).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(1);
  });
  it("records a failed job and surfaces the error", async () => {
    const failing: TtsAdapter = { ...fakeTts, synthesize: async () => { throw new Error("quota exceeded"); } };
    db.insert(turns).values({ id: "trn_ready3", episodeId: ep.id, seq: 4, questionText: "q", state: "ready", spokenText: "Third.", createdAt: now }).run();
    await expect(speakTurn(db, "trn_ready3", failing)).rejects.toMatchObject({ message: expect.stringMatching(/quota exceeded/) });
    const job = db.select().from(jobs).all().find((j) => j.idempotencyKey === "tts:trn_ready3");
    expect(job?.status).toBe("failed");
    expect(job?.attempts).toBe(1);
  });
});
