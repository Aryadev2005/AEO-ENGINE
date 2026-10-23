export type EngineId = "chatgpt" | "gemini" | "perplexity" | "claude" | "mock";

export interface ProviderRequest {
  prompt: string;
  locale?: string; // e.g. "en-IN"
  location?: string; // e.g. "Bengaluru, India" — injected into system prompt
  webSearch: boolean; // use search/grounding when the provider supports it
}

export interface ProviderCitation {
  url: string;
  title?: string;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ProviderResponse {
  engine: EngineId;
  model: string;
  text: string;
  citations: ProviderCitation[];
  usage: ProviderUsage;
  latencyMs: number;
  raw?: unknown; // provider raw payload (store truncated)
}

export interface Provider {
  id: EngineId;
  isConfigured(): boolean;
  run(req: ProviderRequest): Promise<ProviderResponse>;
}

export class ProviderError extends Error {
  constructor(
    public engine: EngineId,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
