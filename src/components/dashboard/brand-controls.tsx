"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const POLL_INTERVAL_MS = 3000;

export function BrandControls({
  brandId,
  initialSchedule,
}: {
  brandId: string;
  initialSchedule: "off" | "weekly" | "daily";
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [schedule, setSchedule] = useState(initialSchedule);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pollScan(scanId: string) {
    pollRef.current = setTimeout(async () => {
      const res = await fetch(`/api/scans/${scanId}`);
      const data = await res.json();
      if (data.scan?.status === "done") {
        setStatus("done");
        router.refresh();
      } else if (data.scan?.status === "failed") {
        setStatus("failed");
      } else {
        pollScan(scanId);
      }
    }, POLL_INTERVAL_MS);
  }

  async function runScan() {
    setStatus("running");
    const res = await fetch(`/api/brands/${brandId}/scans`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus("failed");
      alert(data.error ?? "Failed to start scan");
      return;
    }
    pollScan(data.scanId);
  }

  async function updateSchedule(value: string | null) {
    if (!value) return;
    const next = value as "off" | "weekly" | "daily";
    setSchedule(next);
    await fetch(`/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: next }),
    });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {status === "running" && <span className="text-muted-foreground text-sm">Scanning…</span>}
      {status === "failed" && <span className="text-destructive text-sm">Scan failed</span>}
      <Select value={schedule} onValueChange={updateSchedule}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="off">Off</SelectItem>
          <SelectItem value="weekly">Weekly</SelectItem>
          <SelectItem value="daily">Daily</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={runScan} disabled={status === "running"}>
        {status === "running" ? "Scanning…" : "Run scan now"}
      </Button>
    </div>
  );
}
