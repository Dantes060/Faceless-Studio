import { LLM } from "../config";
import type { ResolvedKeys } from "../keys";
import { fetchJson, ProviderError, type LlmProvider, type LlmResult } from "./types";

/** Any OpenAI-compatible chat completions endpoint: OpenAI, DeepSeek, OpenRouter, vLLM… */
export class CompatibleLlm implements LlmProvider {
  readonly live = true;
  constructor(
    readonly name: string,
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async complete(args: {
    system: string;
    user: string;
    json?: boolean;
    temperature?: number;
    maxTokens?: number;
  }): Promise<LlmResult> {
    const started = Date.now();
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      temperature: args.temperature ?? 0.8,
      max_tokens: args.maxTokens ?? 8000,
    };
    if (args.json) body.response_format = { type: "json_object" };

    const json = (await fetchJson(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    const text = json.choices?.[0]?.message?.content;
    if (!text) {
      throw new ProviderError(json.error?.message ?? "Empty completion from model");
    }
    return {
      text,
      provider: this.name,
      model: this.model,
      live: true,
      ms: Date.now() - started,
    };
  }
}

export function configuredLlm(keys: ResolvedKeys): CompatibleLlm {
  if (LLM.provider === "deepseek") {
    if (!keys.deepseekKey) throw new ProviderError("DEEPSEEK_API_KEY is not set");
    return new CompatibleLlm("deepseek", LLM.deepseekModel, LLM.deepseekBaseUrl, keys.deepseekKey);
  }
  if (LLM.provider === "custom") {
    if (!keys.customLlmKey || !LLM.customBaseUrl) {
      throw new ProviderError("LLM_API_KEY and LLM_BASE_URL are required for LLM_PROVIDER=custom");
    }
    return new CompatibleLlm("custom", LLM.customModel ?? "default", LLM.customBaseUrl, keys.customLlmKey);
  }
  if (!keys.openaiKey) throw new ProviderError("OPENAI_API_KEY is not set");
  return new CompatibleLlm("openai", LLM.openaiModel, LLM.openaiBaseUrl, keys.openaiKey);
}
