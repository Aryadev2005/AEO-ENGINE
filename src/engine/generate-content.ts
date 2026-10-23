import { callUtilityModel } from "./llm-utility";
import type { RecommendationDraft } from "./recommend";

export interface GeneratedContent {
  content: string;
  format: "markdown" | "json-ld" | "text";
}

export interface ContentContext {
  brandName: string;
  category?: string;
  website?: string;
  city?: string;
  topCitedDomain?: string;
  faqPrompts?: string[];
  comparisonCompetitor?: string;
  communityTopics?: string[];
  negativeSnippets?: string[];
}

async function llmMarkdown(prompt: string, fallback: string): Promise<string> {
  try {
    const raw = await callUtilityModel(
      `${prompt} Respond with ONLY JSON: {"content": string (markdown)}, no commentary.`,
    );
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const json = JSON.parse(raw.slice(start, end + 1)) as { content?: string };
    if (json.content) return json.content;
  } catch {
    // fall through
  }
  return fallback;
}

export async function generateRecommendationContent(
  draft: RecommendationDraft,
  ctx: ContentContext,
): Promise<GeneratedContent> {
  switch (draft.type) {
    case "get_listed": {
      const domain = ctx.topCitedDomain ?? "the cited site";
      const fallback = `## Claim your listing on ${domain}\n\nSearch for "${ctx.brandName}" on ${domain} and claim or create your business profile.\n\n### Suggested profile description\n${ctx.brandName} is a ${ctx.category ?? "business"}${ctx.city ? ` based in ${ctx.city}` : ""}. [Add 2-3 sentences on what makes you different, your specialties, and how to reach you.]`;
      const content = await llmMarkdown(
        `Write a short markdown guide for claiming a business listing on ${domain} for "${ctx.brandName}" ` +
          `(a ${ctx.category ?? "business"}${ctx.city ? ` in ${ctx.city}` : ""}), plus a ready-to-paste 2-3 sentence profile description.`,
        fallback,
      );
      return { content, format: "markdown" };
    }

    case "faq_page": {
      const prompts = ctx.faqPrompts?.slice(0, 5) ?? [`best ${ctx.category ?? "options"} in ${ctx.city ?? "your area"}`];
      const fallback = `# FAQ\n\n${prompts.map((p) => `### ${p}?\n[Answer this directly, naming ${ctx.brandName} and what makes it a strong choice.]`).join("\n\n")}`;
      const content = await llmMarkdown(
        `Write a markdown FAQ page for "${ctx.brandName}" (a ${ctx.category ?? "business"}) that directly answers these ` +
          `exact questions in an extractable Q&A format, each with a 2-3 sentence answer that names "${ctx.brandName}" ` +
          `naturally: ${prompts.join(" | ")}`,
        fallback,
      );
      return { content, format: "markdown" };
    }

    case "comparison_page": {
      const competitor = ctx.comparisonCompetitor ?? "the alternative";
      const fallback = `# ${ctx.brandName} vs ${competitor}\n\n## Overview\n[One paragraph on each.]\n\n## Key differences\n- [Difference 1]\n- [Difference 2]\n\n## Which should you choose?\n[Guidance for different buyer needs.]`;
      const content = await llmMarkdown(
        `Write a markdown "${ctx.brandName} vs ${competitor}" comparison page outline with section headers and ` +
          `placeholder guidance (not fabricated claims) for a ${ctx.category ?? "business"} buyer deciding between them.`,
        fallback,
      );
      return { content, format: "markdown" };
    }

    case "schema": {
      const content = JSON.stringify(
        {
          "@context": "https://schema.org",
          "@type": ctx.city ? "LocalBusiness" : "Organization",
          name: ctx.brandName,
          ...(ctx.website ? { url: ctx.website } : {}),
          ...(ctx.category ? { description: `${ctx.brandName} — ${ctx.category}` } : {}),
          ...(ctx.city ? { address: { "@type": "PostalAddress", addressLocality: ctx.city } } : {}),
        },
        null,
        2,
      );
      return { content, format: "json-ld" };
    }

    case "llms_txt": {
      const content = `# ${ctx.brandName}\n\n> ${ctx.category ?? "Business"}${ctx.city ? ` based in ${ctx.city}` : ""}.\n\n[Add a short paragraph describing what you offer and who it's for.]\n\n## Pages\n- [Home](${ctx.website ?? "/"})\n- [About](${ctx.website ?? "/"}/about)\n- [Contact](${ctx.website ?? "/"}/contact)\n`;
      return { content, format: "text" };
    }

    case "community": {
      const topics = ctx.communityTopics?.length
        ? ctx.communityTopics
        : [`best ${ctx.category ?? "options"}${ctx.city ? ` in ${ctx.city}` : ""}`, `${ctx.category ?? "options"} recommendations`];
      const content = `## Threads worth joining\n\n${topics.map((t) => `- Search Reddit/YouTube for: "${t}"`).join("\n")}\n\n## Guidance\nContribute genuinely — answer the question first, mention ${ctx.brandName} only where it's actually relevant, and disclose that you're affiliated. Never astroturf or use multiple accounts.`;
      return { content, format: "markdown" };
    }

    case "reviews": {
      return {
        content: `See the Reviews tab for ready-to-send WhatsApp/SMS/email review-request templates and reply drafts.`,
        format: "text",
      };
    }

    case "reputation": {
      const snippets = ctx.negativeSnippets?.slice(0, 3) ?? [];
      const fallback = `## What's being said\n${snippets.map((s) => `> ${s}`).join("\n\n") || "[No specific snippets captured.]"}\n\n## Suggested response\nPublish factual content (an FAQ entry, a changelog, or a direct page) that addresses the concern head-on with specifics — not a generic rebuttal.`;
      const content = await llmMarkdown(
        `A business called "${ctx.brandName}" received negative sentiment in AI-generated answers with this context: ` +
          `${snippets.join(" | ") || "(no specific context captured)"}. Write brief markdown guidance: what factual content ` +
          `(FAQ entry, page, etc.) would address this concern honestly, without being defensive or dismissive.`,
        fallback,
      );
      return { content, format: "markdown" };
    }

    default:
      return { content: "", format: "text" };
  }
}
