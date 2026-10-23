import Link from "next/link";
import { listBrandsWithSummary } from "@/lib/brands";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDelta(latest: number | null, previous: number | null): React.ReactNode {
  if (latest === null) return null;
  if (previous === null) return <span className="text-muted-foreground text-xs">first scan</span>;
  const delta = Math.round((latest - previous) * 10) / 10;
  if (delta === 0) return <span className="text-muted-foreground text-xs">no change</span>;
  const positive = delta > 0;
  return (
    <span className={`text-xs ${positive ? "text-green-600" : "text-destructive"}`}>
      {positive ? "+" : ""}
      {delta} vs last scan
    </span>
  );
}

export default async function WorkspaceHomePage() {
  const session = await auth();
  const summaries = session ? await listBrandsWithSummary(session.workspaceId) : [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Brands</h1>
        <Button render={<Link href="/app/brands/new" />} nativeButton={false}>
          Add brand
        </Button>
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center">
            No brands yet.{" "}
            <Link href="/app/brands/new" className="text-foreground underline">
              Add your first brand
            </Link>{" "}
            to run your first scan.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map(({ brand, latestOverallScore, previousOverallScore, lastScanAt }) => (
            <Link key={brand.id} href={`/app/brands/${brand.id}`}>
              <Card className="hover:border-foreground/30 transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {brand.name}
                    {brand.schedule !== "off" && (
                      <Badge variant="secondary">{brand.schedule}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums">
                      {latestOverallScore === null ? "—" : Math.round(latestOverallScore)}
                    </span>
                    <span className="text-muted-foreground text-sm">/ 100</span>
                  </div>
                  {formatDelta(latestOverallScore, previousOverallScore)}
                  <p className="text-muted-foreground mt-2 text-xs">
                    {lastScanAt ? `Last scan ${lastScanAt.toLocaleDateString()}` : "No scans yet"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
