import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckerWidget } from "@/components/checker/checker-widget";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile";

const ENGINES = [
  { name: "ChatGPT", note: "via OpenAI, with web search" },
  { name: "Gemini", note: "with Google Search grounding" },
  { name: "Perplexity", note: "native, citation-heavy by design" },
  { name: "Claude", note: "via Anthropic, with web search" },
];

const STEPS = [
  {
    title: "1. Tell us who you are",
    body: "Your brand, competitors, and the buyer questions people actually ask.",
  },
  {
    title: "2. We ask the AIs",
    body: "We run those questions against ChatGPT, Gemini, Perplexity and Claude — the same way a real buyer would.",
  },
  {
    title: "3. Get a scored fix list",
    body: "See exactly where you're missing, who's winning instead, and the content to fix it.",
  },
];

const FAQS = [
  {
    q: "Do you scrape chatgpt.com or gemini.google.com?",
    a: "No. We only use each provider's official API, with web search/grounding enabled where supported. This closely approximates — but won't exactly match — what you'd see in the consumer apps.",
  },
  {
    q: "Will you post fake reviews for me?",
    a: "Never. We help you request genuine reviews from real customers and draft replies to existing reviews. We will not generate or post fake reviews, and we won't build features that blur that line.",
  },
  {
    q: "How much does a scan cost to run?",
    a: "A handful of cents per scan. Every LLM call is logged and budgeted — see the pricing page for what's included at each plan.",
  },
  {
    q: "What if I don't have API keys yet?",
    a: "The free checker and the dashboard both work in a deterministic mock mode with zero keys configured, so you can see exactly how it works before spending anything.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Is ChatGPT recommending <span className="text-muted-foreground">you</span> — or your
              competitor?
            </h1>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">
              See exactly how often AI assistants recommend your business, who they recommend
              instead, and what to fix — in under a minute.
            </p>
          </div>
          <CheckerWidget compact turnstileSiteKey={TURNSTILE_SITE_KEY} />
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="mb-8 text-center text-2xl font-semibold">How it works</h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {STEPS.map((s) => (
                <Card key={s.title}>
                  <CardHeader>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">{s.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="mb-8 text-center text-2xl font-semibold">What we track</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ENGINES.map((e) => (
              <Card key={e.name}>
                <CardHeader>
                  <CardTitle className="text-base">{e.name}</CardTitle>
                  <CardDescription>{e.note}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
          <p className="text-muted-foreground mt-4 text-center text-xs">
            Results come from each provider&apos;s API with web search on — this approximates but
            doesn&apos;t exactly match the consumer apps.
          </p>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-3xl px-4 py-16">
            <h2 className="mb-6 text-center text-2xl font-semibold">FAQ</h2>
            <Accordion>
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
