"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Candidate {
  placeId: string;
  name: string;
  address: string;
}

interface ReviewTemplates {
  whatsapp: string;
  sms: string;
  email: { subject: string; body: string };
}

interface PlaceReview {
  authorName: string;
  rating: number | null;
  text: string;
  relativeTime: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function ConnectPlace({ brandId, brandName, city }: { brandId: string; brandName: string; city?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(`${brandName}${city ? ` ${city}` : ""}`);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/reviews/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setCandidates(data.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function connect(placeId: string) {
    setLoading(true);
    try {
      await fetch(`/api/brands/${brandId}/reviews/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect Google Places</CardTitle>
        <CardDescription>Find your business to pull in ratings and reviews.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <form onSubmit={search} className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" disabled={loading}>
            Search
          </Button>
        </form>
        {candidates.map((c) => (
          <div key={c.placeId} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-muted-foreground text-xs">{c.address}</p>
            </div>
            <Button size="sm" onClick={() => connect(c.placeId)} disabled={loading}>
              Connect
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ReviewsDashboard({
  brandId,
  brandName,
  rating,
  reviewCount,
  reviews,
  templates,
}: {
  brandId: string;
  brandName: string;
  rating: number | null;
  reviewCount: number | null;
  reviews: PlaceReview[];
  templates: ReviewTemplates;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [drafting, setDrafting] = useState<number | null>(null);

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch(`/api/brands/${brandId}/reviews/refresh`, { method: "POST" });
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function draftReply(index: number) {
    setDrafting(index);
    try {
      const res = await fetch(`/api/brands/${brandId}/reviews/reply-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewIndex: index }),
      });
      const data = await res.json();
      setDrafts((prev) => ({ ...prev, [index]: data.reply }));
    } finally {
      setDrafting(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Google rating</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{rating ?? "—"}</span>
            <span className="text-muted-foreground text-sm">★ ({reviewCount ?? 0} reviews)</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ask for genuine reviews</CardTitle>
          <CardDescription>Send real customers a direct link — never generate reviews yourself.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-2 rounded-md border p-3">
            <p className="text-sm">{templates.whatsapp}</p>
            <CopyButton text={templates.whatsapp} />
          </div>
          <div className="flex items-start justify-between gap-2 rounded-md border p-3">
            <p className="text-sm">{templates.sms}</p>
            <CopyButton text={templates.sms} />
          </div>
          <div className="flex items-start justify-between gap-2 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{templates.email.subject}</p>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{templates.email.body}</p>
            </div>
            <CopyButton text={`${templates.email.subject}\n\n${templates.email.body}`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent reviews</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviews.length === 0 && <p className="text-muted-foreground text-sm">No reviews fetched yet.</p>}
          {reviews.map((r, i) => (
            <div key={i} className="rounded-md border p-3">
              <p className="text-sm font-medium">
                {r.authorName} {r.rating !== null && `· ${r.rating}★`}{" "}
                <span className="text-muted-foreground font-normal">{r.relativeTime}</span>
              </p>
              <p className="mt-1 text-sm">{r.text}</p>
              {drafts[i] ? (
                <div className="bg-muted mt-2 flex items-start justify-between gap-2 rounded-md p-2">
                  <p className="text-sm">{drafts[i]}</p>
                  <CopyButton text={drafts[i]} />
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => draftReply(i)}
                  disabled={drafting === i}
                >
                  {drafting === i ? "Drafting…" : `${brandName} reply draft`}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
