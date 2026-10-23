import { notFound } from "next/navigation";
import { BrandControls } from "@/components/dashboard/brand-controls";
import { ScoreTrendChart } from "@/components/dashboard/score-trend-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getBrand,
  getLatestDoneScanResults,
  getLatestScores,
  getScoreHistory,
} from "@/lib/brands";
import { auth } from "@/lib/auth";

export default async function BrandDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) notFound();

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) notFound();

  const { scores } = await getLatestScores(id);
  const history = await getScoreHistory(id);
  const latestResults = await getLatestDoneScanResults(id);

  const allScore = scores.find((s) => s.engine === "all");
  const engineScores = scores.filter((s) => s.engine !== "all");

  const trendPoints = history.map((h) => ({
    date: h.computedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: Math.round(h.overallScore),
  }));

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
  const totalMentions =
    brandMentions + Array.from(competitorCounts.values()).reduce((a, b) => a + b, 0);
  const leaderboard = [
    { name: brand.name, count: brandMentions, isBrand: true },
    ...Array.from(competitorCounts.entries()).map(([name, count]) => ({ name, count, isBrand: false })),
  ].sort((a, b) => b.count - a.count);

  const citationCounts = new Map<string, { count: number; sourceType: string; isOwn: boolean }>();
  if (latestResults) {
    for (const r of latestResults.results) {
      for (const c of r.citations) {
        const existing = citationCounts.get(c.domain);
        if (existing) existing.count++;
        else citationCounts.set(c.domain, { count: 1, sourceType: c.sourceType, isOwn: c.sourceType === "own_site" });
      }
    }
  }
  const topSources = Array.from(citationCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  const suggestedCompetitors = latestResults
    ? Array.from(new Set(latestResults.results.flatMap((r) => r.suggestedCompetitors)))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{brand.name}</h1>
          <p className="text-muted-foreground text-sm">
            {[brand.category, brand.city, brand.country].filter(Boolean).join(" · ")}
            {brand.website && (
              <>
                {" · "}
                <a href={brand.website} target="_blank" rel="noreferrer" className="underline">
                  {brand.website}
                </a>
              </>
            )}
          </p>
        </div>
        <BrandControls brandId={brand.id} initialSchedule={brand.schedule} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">AI Visibility Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold tabular-nums">
              {allScore ? Math.round(allScore.overallScore) : "—"}
            </div>
            <p className="text-muted-foreground text-sm">out of 100</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreTrendChart points={trendPoints} />
          </CardContent>
        </Card>
      </div>

      {engineScores.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {engineScores.map((s) => (
            <Card key={s.engine}>
              <CardHeader>
                <CardTitle className="text-base capitalize">{s.engine}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  Visibility <strong>{Math.round(s.visibilityPct)}%</strong>
                </p>
                <p>
                  Avg position <strong>{s.avgPosition ? s.avgPosition.toFixed(1) : "—"}</strong>
                </p>
                <p>
                  Share of voice <strong>{Math.round(s.shareOfVoicePct)}%</strong>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {suggestedCompetitors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggested competitors</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-2 text-sm">
              Found in AI answers but not yet tracked:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedCompetitors.map((c) => (
                <Badge key={c} variant="outline">
                  {c}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitor leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="text-muted-foreground text-sm">No scan data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mentions</TableHead>
                    <TableHead>Share of voice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className={row.isBrand ? "font-medium" : ""}>
                        {row.name}
                        {row.isBrand && <Badge className="ml-2">you</Badge>}
                      </TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>
                        {totalMentions > 0 ? Math.round((row.count / totalMentions) * 100) : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top cited sources</CardTitle>
          </CardHeader>
          <CardContent>
            {topSources.length === 0 ? (
              <p className="text-muted-foreground text-sm">No scan data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Cited</TableHead>
                    <TableHead>You&apos;re there</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSources.map(([domain, info]) => (
                    <TableRow key={domain}>
                      <TableCell>{domain}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {info.sourceType.replace("_", " ")}
                      </TableCell>
                      <TableCell>{info.count}x</TableCell>
                      <TableCell>{info.isOwn ? "✅" : "❌"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
