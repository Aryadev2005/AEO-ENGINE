"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Recommendation {
  id: string;
  type: string;
  title: string;
  why: string;
  priority: "high" | "med" | "low";
  status: "open" | "done" | "dismissed";
  generatedContent: string | null;
  contentFormat: string | null;
}

const PRIORITY_LABEL: Record<string, string> = { high: "High", med: "Medium", low: "Low" };

export function FixesList({ initial }: { initial: Recommendation[] }) {
  const [recs, setRecs] = useState(initial);
  const [filter, setFilter] = useState<"open" | "done" | "dismissed" | "all">("open");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visible = filter === "all" ? recs : recs.filter((r) => r.status === filter);

  async function setStatus(id: string, status: "open" | "done" | "dismissed") {
    setBusy(id);
    try {
      await fetch(`/api/recommendations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } finally {
      setBusy(null);
    }
  }

  async function regenerate(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/recommendations/${id}/regenerate`, { method: "POST" });
      if (res.ok) {
        // naive refetch of just this recommendation's content isn't available, so refresh the page data
        window.location.reload();
      }
    } finally {
      setBusy(null);
    }
  }

  function copy(id: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(v) => v && setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="open">Open ({recs.filter((r) => r.status === "open").length})</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center">
            Nothing here. Run a scan to generate fixes.
          </CardContent>
        </Card>
      )}

      {visible.map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <button className="text-left hover:underline" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                {r.title}
              </button>
              <Badge variant={r.priority === "high" ? "destructive" : "secondary"}>
                {PRIORITY_LABEL[r.priority]}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">{r.why}</p>
            {expanded === r.id && r.generatedContent && (
              <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                {r.generatedContent}
              </pre>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                {expanded === r.id ? "Hide" : "View"} content
              </Button>
              {r.generatedContent && (
                <Button variant="outline" size="sm" onClick={() => copy(r.id, r.generatedContent!)}>
                  {copiedId === r.id ? "Copied" : "Copy"}
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => regenerate(r.id)}>
                Regenerate
              </Button>
              {r.status !== "done" && (
                <Button size="sm" disabled={busy === r.id} onClick={() => setStatus(r.id, "done")}>
                  Mark done
                </Button>
              )}
              {r.status !== "dismissed" && (
                <Button variant="ghost" size="sm" disabled={busy === r.id} onClick={() => setStatus(r.id, "dismissed")}>
                  Dismiss
                </Button>
              )}
              {r.status !== "open" && (
                <Button variant="ghost" size="sm" disabled={busy === r.id} onClick={() => setStatus(r.id, "open")}>
                  Reopen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
