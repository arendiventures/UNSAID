import { fail, ok, route } from "@/lib/api";
import { getTts } from "@/lib/providers/registry";
import { defaultVoiceId } from "@/lib/providers/tts/elevenlabs";

export const GET = route(async (req: Request) => {
  const tts = getTts();
  const info = tts.info();
  if (!info.configured) return fail(`Text-to-speech is not configured (missing ${info.missingEnv.join(", ")}).`, 409, { missingEnv: info.missingEnv });
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const voices = await tts.listVoices(refresh);
    return ok({ voices, defaultVoiceId: defaultVoiceId() });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not list voices", 502);
  }
});
