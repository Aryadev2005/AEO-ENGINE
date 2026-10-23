import { MODELS, OPENROUTER_API_KEY, systemPromptFor } from "./config";
import { fetchWithRetry } from "./providers/http";

/**
 * Calls the cheapest configured model (MODEL_UTILITY) for small JSON tasks
 * (extraction, checker prompt generation). Throws when OpenRouter isn't
 * configured; callers degrade gracefully rather than failing outright.
 */
export async function callUtilityModel(prompt: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not configured; skipping LLM call");
  }
  const res = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELS.utility,
      messages: [
        { role: "system", content: systemPromptFor() },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}
