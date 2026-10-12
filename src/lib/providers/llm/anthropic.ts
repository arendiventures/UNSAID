import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GuestResponseSchema } from "@/lib/engine/schema";
import { appConfig, missingVars, redactSecrets } from "@/lib/config/env";
import type { ConnectionTest, LlmAdapter, LlmGenerateInput, LlmGenerateResult, ProviderInfo } from "../types";

type Effort = "low" | "medium" | "high";

function effort(): Effort {
  const e = process.env.UNSAID_LLM_EFFORT?.trim();
  return e === "medium" || e === "high" ? e : "low";
}

/**
 * Claude via the official SDK. Structured output is requested with output_config.format
 * and parsed by the SDK; validation against retrieved passages happens in the engine.
 */
export class AnthropicLlmAdapter implements LlmAdapter {
  readonly id = "anthropic";
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
    }
    return this.client;
  }

  info(): ProviderInfo {
    const missing = missingVars("anthropic");
    return {
      id: this.id,
      category: "llm",
      name: "Anthropic Claude (Messages API)",
      implemented: true,
      configured: missing.length === 0,
      missingEnv: missing,
      selection: { model: appConfig.llmModel, effort: effort() },
      capabilities: [
        { key: "structured_output", label: "Structured JSON responses", supported: true },
        { key: "prompt_caching", label: "Prompt caching of the guest system prompt", supported: true },
        { key: "cancellation", label: "Cancel an in-flight generation", supported: true },
        { key: "usage_metrics", label: "Token usage returned per request", supported: true },
      ],
      notes: [
        "Set ANTHROPIC_API_KEY in .env.local. The key never leaves the server.",
        "Model id comes from UNSAID_LLM_MODEL (default claude-opus-5-5). Effort from UNSAID_LLM_EFFORT (low|medium|high; default low for conversational latency).",
      ],
      docsUrl: "https://platform.claude.com/docs",
    };
  }

  async test(): Promise<ConnectionTest> {
    const testedAt = new Date().toISOString();
    const missing = missingVars("anthropic");
    if (missing.length) return { ok: false, message: `Missing environment variable: ${missing.join(", ")}`, testedAt };
    try {
      const model = await this.getClient().models.retrieve(appConfig.llmModel);
      return { ok: true, message: `Authenticated. Model ${model.id} (${model.display_name}) is available.`, details: { model: model.id }, testedAt };
    } catch (err) {
      return { ok: false, message: describeError(err), testedAt };
    }
  }

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const started = Date.now();
    const missing = missingVars("anthropic");
    if (missing.length) return { kind: "error", message: `Anthropic is not configured (missing ${missing.join(", ")}).`, retryable: false, latencyMs: 0 };
    const model = appConfig.llmModel;
    try {
      const response = await this.getClient().messages.parse(
        {
          model,
          max_tokens: 2048,
          system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
          messages: input.turns.map((t) => ({ role: t.role, content: t.content })),
          output_config: { format: zodOutputFormat(GuestResponseSchema), effort: effort() },
        },
        { signal: input.signal },
      );
      const latencyMs = Date.now() - started;
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? undefined,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? undefined,
      };
      if (response.stop_reason === "refusal") {
        const details = response.stop_details as { explanation?: string | null } | null | undefined;
        return { kind: "refused", reason: details?.explanation || "The model declined to answer this request.", model: response.model, usage, latencyMs };
      }
      const text = response.content.find((b) => b.type === "text");
      let raw: unknown = response.parsed_output ?? null;
      if (raw === null && text && text.type === "text") {
        try {
          raw = JSON.parse(text.text);
        } catch {
          raw = { _unparsed: text.text };
        }
      }
      return { kind: "ok", raw, parsed: response.parsed_output ?? null, model: response.model, usage, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      if (input.signal?.aborted || (err instanceof Error && err.name === "AbortError")) return { kind: "cancelled", latencyMs };
      const retryable = err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError;
      return { kind: "error", message: describeError(err), retryable, latencyMs };
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Authentication failed: the API key was rejected.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Permission denied for this key or model.";
  if (err instanceof Anthropic.NotFoundError) return `Model not found: ${appConfig.llmModel}. Check UNSAID_LLM_MODEL.`;
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the provider. Try again shortly.";
  if (err instanceof Anthropic.BadRequestError) return `Bad request: ${redactSecrets(err.message)}`;
  if (err instanceof Anthropic.APIConnectionError) return `Could not reach the Anthropic API: ${redactSecrets(err.message)}`;
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ""}: ${redactSecrets(err.message)}`;
  if (err instanceof Error) return redactSecrets(err.message);
  return "Unknown error";
}
