"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsForm({
  initialName,
  initialBudget,
  canEdit,
}: {
  initialName: string;
  initialBudget: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [budget, setBudget] = useState(String(initialBudget));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, monthlyBudgetUsd: Number(budget) }),
      });
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workspace</CardTitle>
      </CardHeader>
      <form onSubmit={save}>
        <CardContent className="grid max-w-sm gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input id="ws-name" disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ws-budget">Monthly budget (USD)</Label>
            <Input
              id="ws-budget"
              type="number"
              min={0}
              step={0.5}
              disabled={!canEdit}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          {canEdit && (
            <Button type="submit" disabled={saving} className="w-fit">
              {saving ? "Saving…" : saved ? "Saved" : "Save"}
            </Button>
          )}
          {!canEdit && (
            <p className="text-muted-foreground text-xs">Only the workspace owner can change these.</p>
          )}
        </CardContent>
      </form>
    </Card>
  );
}
