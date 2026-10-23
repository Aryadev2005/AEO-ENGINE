"use client";

import { useState } from "react";
import { AnswerText } from "@/components/answer-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { TurnstileWidget } from "@/components/turnstile-widget";

interface MiniResult {
  checkerResultId: string;
  overallScore: number;
  mentionedCount: number;
  totalAnswers: number;
  topCompetitors: string[];
  sampleAnswerBlurred: string;
}

interface FullResultEntity {
  name: string;
  isBrand: boolean;
}

interface FullResultItem {
  promptText: string;
  engine: string;
  brandMentioned: boolean;
  brandPosition: number | null;
  answerText: string;
  entities: FullResultEntity[];
  citations: { url: string; domain: string }[];
  failed: boolean;
}

interface FullResult extends MiniResult {
  results: FullResultItem[];
  topFixes: { type: string; title: string; why: string; priority: "high" | "med" | "low" }[];
}

type Step = "form" | "mini" | "unlock" | "full";

const PRIORITY_LABEL: Record<string, string> = { high: "High priority", med: "Medium priority", low: "Low priority" };

export function CheckerWidget({
  compact = false,
  turnstileSiteKey = "",
}: {
  compact?: boolean;
  turnstileSiteKey?: string;
}) {
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const [mini, setMini] = useState<MiniResult | null>(null);
  const [full, setFull] = useState<FullResult | null>(null);

  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [consent, setConsent] = useState(false);

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/checker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          category,
          city: city || undefined,
          website: website || undefined,
          turnstileToken: turnstileToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setMini(data);
      setStep("mini");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!mini) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/checker/${mini.checkerResultId}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || undefined,
          whatsapp: whatsapp || undefined,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setFull(data);
      setStep("full");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Couldn&apos;t run that check</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "form" && (
        <Card>
          <CardHeader>
            <CardTitle>{compact ? "Check your AI visibility" : "Run your free AI Visibility Check"}</CardTitle>
            <CardDescription>
              See whether ChatGPT, Gemini and Perplexity recommend you — or your competitors.
            </CardDescription>
          </CardHeader>
          <form onSubmit={runCheck}>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="businessName">Business or product name</Label>
                <Input
                  id="businessName"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Velectico"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="IT services company"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">City (optional)</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kolkata" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="website">Website (optional)</Label>
                <Input
                  id="website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://velectico.com"
                />
              </div>
              {turnstileSiteKey && (
                <TurnstileWidget siteKey={turnstileSiteKey} onVerify={setTurnstileToken} />
              )}
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                disabled={loading || (Boolean(turnstileSiteKey) && !turnstileToken)}
                className="w-full"
              >
                {loading ? "Checking…" : "Check my AI visibility — free"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "mini" && mini && (
        <Card>
          <CardHeader>
            <CardTitle>Your AI Visibility Score</CardTitle>
            <CardDescription>Based on {mini.totalAnswers} real answers from AI assistants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-5xl font-bold tabular-nums">{Math.round(mini.overallScore)}</span>
                <span className="text-muted-foreground text-sm">/ 100</span>
              </div>
              <Progress value={mini.overallScore} />
            </div>
            <p className="text-sm">
              Mentioned in <strong>{mini.mentionedCount} of {mini.totalAnswers}</strong> AI answers.
            </p>
            {mini.topCompetitors.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Showed up instead of you:</p>
                <div className="flex flex-wrap gap-2">
                  {mini.topCompetitors.map((c) => (
                    <Badge key={c} variant="secondary">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-medium">Sample answer</p>
              <p className="bg-muted rounded-md p-3 text-sm italic text-muted-foreground">
                {mini.sampleAnswerBlurred}
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => setStep("unlock")}>
              Unlock full report
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "unlock" && mini && (
        <Card>
          <CardHeader>
            <CardTitle>Unlock your full report</CardTitle>
            <CardDescription>
              See every answer, every citation, and your top 3 fixes. We&apos;ll also send the report your way.
            </CardDescription>
          </CardHeader>
          <form onSubmit={unlock}>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="whatsapp">or WhatsApp number</Label>
                <Input
                  id="whatsapp"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="consent"
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  required
                />
                <Label htmlFor="consent" className="text-muted-foreground text-sm font-normal">
                  I agree to be contacted about this report. No spam.
                </Label>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={loading || !consent || (!email && !whatsapp)} className="w-full">
                {loading ? "Unlocking…" : "Show my full report"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "full" && full && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Full report for {businessName}</CardTitle>
              <CardDescription>
                Score {Math.round(full.overallScore)}/100 · mentioned in {full.mentionedCount}/{full.totalAnswers} answers
              </CardDescription>
            </CardHeader>
          </Card>

          {full.topFixes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top fixes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {full.topFixes.map((fix, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium">{fix.title}</span>
                      <Badge variant={fix.priority === "high" ? "destructive" : "secondary"}>
                        {PRIORITY_LABEL[fix.priority]}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">{fix.why}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All answers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {full.results.map((r, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{r.engine}</Badge>
                    {r.failed ? (
                      <Badge variant="destructive">failed</Badge>
                    ) : r.brandMentioned ? (
                      <Badge>mentioned · #{r.brandPosition}</Badge>
                    ) : (
                      <Badge variant="secondary">not mentioned</Badge>
                    )}
                    <span className="text-muted-foreground text-sm">&ldquo;{r.promptText}&rdquo;</span>
                  </div>
                  <AnswerText
                    text={r.answerText}
                    brandName={businessName}
                    competitorNames={r.entities.filter((e) => !e.isBrand).map((e) => e.name)}
                  />
                  {r.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.citations.map((c, j) => (
                        <a
                          key={j}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                        >
                          {c.domain}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
