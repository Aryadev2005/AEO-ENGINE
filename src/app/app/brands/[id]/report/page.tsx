import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auth } from "@/lib/auth";
import { getBrand, getLatestDoneScanResults, getLatestScores, getScoreHistory } from "@/lib/brands";
import { listRecommendations } from "@/lib/recommendations";
import { getWorkspace } from "@/lib/workspace";
import { PrintButton } from "./print-button";

export default async function BrandReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) notFound();

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) notFound();

  const workspace = await getWorkspace(session.workspaceId);
  const { scores } = await getLatestScores(id);
  const history = await getScoreHistory(id);
  const latestResults = await getLatestDoneScanResults(id);
  const recommendations = (await listRecommendations(id)).filter((r) => r.status === "open").slice(0, 5);

  const allScore = scores.find((s) => s.engine === "all");
  const engineScores = scores.filter((s) => s.engine !== "all");

  const competitorCounts = new Map<string, number>();
  let brandMentions = 0;
  if (latestResults) {
    for (const r of latestResults.results) {
      if (r.brandMentioned) brandMentions++;
      for (const e of r.entities) {
        if (!e.isBrand) competitorCounts.set(e.name, (competitorCounts.get(e.name) ?? 0) + 1);
      }
    }
  }
  const leaderboard = [
    { name: brand.name, count: brandMentions, isBrand: true },
    ...Array.from(competitorCounts.entries()).map(([name, count]) => ({ name, count, isBrand: false })),
  ].sort((a, b) => b.count - a.count);

  return (
    <div className="mx-auto max-w-3xl space-y-8 bg-white p-2 text-black print:p-0 dark:bg-white">
      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          body { background: white; }
        }
      `}</style>

      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <p className="text-muted-foreground text-sm">{workspace?.name}</p>
          <h1 className="text-2xl font-bold">AI Visibility Report — {brand.name}</h1>
          <p className="text-muted-foreground text-sm">
            {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <PrintButton />
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Headline score</h2>
        <div className="text-5xl font-bold">{allScore ? Math.round(allScore.overallScore) : "—"}</div>
        <p className="text-muted-foreground text-sm">out of 100, across {history.length} scans tracked</p>
      </section>

      {engineScores.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Per-engine breakdown</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engine</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Avg position</TableHead>
                <TableHead>Share of voice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {engineScores.map((s) => (
                <TableRow key={s.engine}>
                  <TableCell className="capitalize">{s.engine}</TableCell>
                  <TableCell>{Math.round(s.visibilityPct)}%</TableCell>
                  <TableCell>{s.avgPosition ? s.avgPosition.toFixed(1) : "—"}</TableCell>
                  <TableCell>{Math.round(s.shareOfVoicePct)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {leaderboard.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Competitor leaderboard</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Mentions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className={row.isBrand ? "font-medium" : ""}>
                    {row.name} {row.isBrand && <Badge className="ml-2">you</Badge>}
                  </TableCell>
                  <TableCell>{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {recommendations.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Top fixes</h2>
          <div className="space-y-3">
            {recommendations.map((r) => (
              <div key={r.id} className="border-l-2 pl-3">
                <p className="font-medium">{r.title}</p>
                <p className="text-muted-foreground text-sm">{r.why}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
