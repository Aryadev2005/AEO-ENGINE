"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";

type EngineId = "chatgpt" | "claude" | "gemini" | "perplexity";

// Rough per-call estimates for display only — mirrors the ballpark figures in README; the
// server computes the authoritative estimate (and the actual cost) when the scan runs.
const ROUGH_COST_PER_CALL: Record<EngineId, number> = {
  chatgpt: 0.0202,
  claude: 0.023,
  gemini: 0.0142,
  perplexity: 0.0057,
};

interface Competitor {
  id: string;
  name: string;
}

interface DraftPrompt {
  text: string;
  intent: string;
}

interface SavedPrompt {
  id: string;
  text: string;
  intent: string;
}

const STEPS = ["Basics", "Competitors", "Prompts", "Engines", "Run scan"];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brandId, setBrandId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [draftPrompts, setDraftPrompts] = useState<DraftPrompt[]>([]);

  const [engines, setEngines] = useState<Record<EngineId, boolean>>({
    chatgpt: true,
    claude: true,
    gemini: true,
    perplexity: true,
  });

  async function createBrand(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category: category || undefined,
          city: city || undefined,
          country: country || undefined,
          website: website || undefined,
          description: description || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error ?? "Failed to create brand"));
      setBrandId(data.brand.id);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create brand");
    } finally {
      setLoading(false);
    }
  }

  async function addCompetitor(competitorName: string) {
    if (!brandId || !competitorName.trim()) return;
    const res = await fetch(`/api/brands/${brandId}/competitors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: competitorName.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setCompetitors((prev) => [...prev, { id: data.id, name: competitorName.trim() }]);
      setSuggestions((prev) => prev.filter((s) => s !== competitorName.trim()));
    }
  }

  async function removeCompetitor(id: string) {
    await fetch(`/api/competitors/${id}`, { method: "DELETE" });
    setCompetitors((prev) => prev.filter((c) => c.id !== id));
  }

  async function suggestCompetitors() {
    if (!brandId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/competitors/suggest`, { method: "POST" });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function generatePrompts() {
    if (!brandId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/prompts/generate`, { method: "POST" });
      const data = await res.json();
      setDraftPrompts(data.prompts ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function addAllDraftPrompts() {
    if (!brandId) return;
    setLoading(true);
    try {
      for (const p of draftPrompts) {
        const res = await fetch(`/api/brands/${brandId}/prompts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: p.text, intent: p.intent }),
        });
        const data = await res.json();
        if (res.ok) setSavedPrompts((prev) => [...prev, { id: data.id, text: p.text, intent: p.intent }]);
      }
      setDraftPrompts([]);
    } finally {
      setLoading(false);
    }
  }

  async function removeSavedPrompt(id: string) {
    await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
  }

  const selectedEngines = (Object.keys(engines) as EngineId[]).filter((e) => engines[e]);
  const estimatedCost =
    selectedEngines.reduce((sum, e) => sum + ROUGH_COST_PER_CALL[e], 0) * savedPrompts.length;

  async function runFirstScan() {
    if (!brandId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engines: selectedEngines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start scan");
      router.push(`/app/brands/${brandId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={
                i === step
                  ? "font-medium"
                  : i < step
                    ? "text-muted-foreground line-through"
                    : "text-muted-foreground"
              }
            >
              {i + 1}. {s}
            </span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Brand basics</CardTitle>
            <CardDescription>What are we tracking?</CardDescription>
          </CardHeader>
          <form onSubmit={createBrand}>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Brand name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Creating…" : "Next: competitors"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Competitors</CardTitle>
            <CardDescription>Who should we compare you against?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Competitor name"
                value={newCompetitor}
                onChange={(e) => setNewCompetitor(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => {
                  addCompetitor(newCompetitor);
                  setNewCompetitor("");
                }}
              >
                Add
              </Button>
            </div>
            <Button variant="secondary" onClick={suggestCompetitors} disabled={loading}>
              {loading ? "Thinking…" : "Suggest competitors"}
            </Button>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => addCompetitor(s)}
                  >
                    + {s}
                  </Badge>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {competitors.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{c.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeCompetitor(c.id)}>
                    Remove
                  </Button>
                </div>
              ))}
              {competitors.length === 0 && (
                <p className="text-muted-foreground text-sm">No competitors added yet (optional).</p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => setStep(2)}>
              Next: prompts
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Prompts</CardTitle>
            <CardDescription>The buyer questions we&apos;ll ask AI assistants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="secondary" onClick={generatePrompts} disabled={loading}>
              {loading ? "Generating…" : "Generate prompts"}
            </Button>
            {draftPrompts.length > 0 && (
              <div className="space-y-2">
                <div className="space-y-1">
                  {draftPrompts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span>{p.text}</span>
                      <Badge variant="outline">{p.intent}</Badge>
                    </div>
                  ))}
                </div>
                <Button onClick={addAllDraftPrompts} disabled={loading}>
                  Add all {draftPrompts.length} prompts
                </Button>
              </div>
            )}
            {savedPrompts.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Saved prompts ({savedPrompts.length})</p>
                <div className="space-y-1">
                  {savedPrompts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span>{p.text}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{p.intent}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => removeSavedPrompt(p.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button className="w-full" disabled={savedPrompts.length === 0} onClick={() => setStep(3)}>
              Next: engines
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Engines</CardTitle>
            <CardDescription>Which AI assistants should we scan?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(engines) as EngineId[]).map((e) => (
              <div key={e} className="flex items-center gap-2">
                <Checkbox
                  id={e}
                  checked={engines[e]}
                  onCheckedChange={(v) => setEngines((prev) => ({ ...prev, [e]: v === true }))}
                />
                <Label htmlFor={e} className="capitalize">
                  {e}
                </Label>
              </div>
            ))}
            <p className="text-muted-foreground pt-2 text-sm">
              Estimated cost for this scan: <strong>${estimatedCost.toFixed(3)}</strong> ({savedPrompts.length}{" "}
              prompts × {selectedEngines.length} engines)
            </p>
          </CardContent>
          <CardFooter>
            <Button className="w-full" disabled={selectedEngines.length === 0} onClick={() => setStep(4)}>
              Next: run scan
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to go</CardTitle>
            <CardDescription>
              {savedPrompts.length} prompts × {selectedEngines.length} engines — roughly $
              {estimatedCost.toFixed(3)}.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" disabled={loading} onClick={runFirstScan}>
              {loading ? "Starting…" : "Run first scan"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
