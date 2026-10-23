import type { PromptRunnerInput } from "./runner";

export type PromptIntent = "discovery" | "comparison" | "alternative" | "review" | "local";

/** Lightweight keyword heuristic; the real "Generate prompts" wizard (M4) will use an LLM instead. */
export function inferIntent(text: string): PromptIntent {
  const t = text.toLowerCase();
  if (/\balternative(s)?\b/.test(t)) return "alternative";
  if (/\bvs\.?\b|\bversus\b|\bcompar/.test(t)) return "comparison";
  if (/\breview(s)?\b|\brating(s)?\b/.test(t)) return "review";
  if (/\bnear me\b|\bin [A-Z]/.test(text) || /\blocal\b/.test(t)) return "local";
  return "discovery";
}

/** One prompt per non-empty, non-comment line. */
export function parsePromptsFile(content: string): PromptRunnerInput[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((text, i) => ({
      id: `p${i + 1}`,
      text,
      intent: inferIntent(text),
    }));
}
