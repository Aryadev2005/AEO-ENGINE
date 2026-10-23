"use client";

import { useState } from "react";
import { AnswerText } from "@/components/answer-text";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Entity {
  name: string;
  isBrand: boolean;
}

interface Citation {
  url: string;
  domain: string;
  sourceType: string;
}

interface ScanResult {
  id: string;
  promptId: string;
  engine: string;
  answerText: string;
  brandMentioned: boolean;
  brandPosition: number | null;
  brandSentiment: "positive" | "neutral" | "negative" | null;
  failed: boolean;
  entities: Entity[];
  citations: Citation[];
}

interface PromptRow {
  id: string;
  text: string;
  intent: string;
}

export function PromptMatrix({
  brandName,
  prompts,
  engines,
  results,
}: {
  brandName: string;
  prompts: PromptRow[];
  engines: string[];
  results: ScanResult[];
}) {
  const [active, setActive] = useState<ScanResult | null>(null);

  const byKey = new Map<string, ScanResult>();
  for (const r of results) byKey.set(`${r.promptId}:${r.engine}`, r);

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prompt</TableHead>
            {engines.map((e) => (
              <TableHead key={e} className="capitalize">
                {e}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {prompts.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="max-w-xs text-sm">
                {p.text}
                <Badge variant="outline" className="ml-2">
                  {p.intent}
                </Badge>
              </TableCell>
              {engines.map((e) => {
                const r = byKey.get(`${p.id}:${e}`);
                if (!r) {
                  return (
                    <TableCell key={e} className="text-muted-foreground text-center">
                      —
                    </TableCell>
                  );
                }
                return (
                  <TableCell key={e}>
                    <button
                      className="hover:bg-muted w-full rounded px-2 py-1 text-left"
                      onClick={() => setActive(r)}
                    >
                      {r.failed
                        ? "✗ failed"
                        : r.brandMentioned
                          ? `✅ #${r.brandPosition}${r.brandSentiment === "negative" ? " ⚠" : ""}`
                          : "❌"}
                    </button>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="capitalize">{active.engine}</DialogTitle>
              </DialogHeader>
              <AnswerText
                text={active.answerText}
                brandName={brandName}
                competitorNames={active.entities.filter((e) => !e.isBrand).map((e) => e.name)}
              />
              {active.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                  {active.citations.map((c, i) => (
                    <a
                      key={i}
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
