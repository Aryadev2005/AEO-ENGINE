import { notFound } from "next/navigation";
import { PromptMatrix } from "@/components/dashboard/prompt-matrix";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getBrand, getLatestDoneScanResults, listPrompts } from "@/lib/brands";

export default async function BrandPromptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) notFound();

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) notFound();

  const prompts = await listPrompts(id);
  const latest = await getLatestDoneScanResults(id);

  if (!latest) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">{brand.name} — prompts</h1>
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center">
            No completed scan yet. Run a scan from the brand dashboard to see the prompt × engine
            matrix.
          </CardContent>
        </Card>
      </div>
    );
  }

  const engines = Array.from(new Set(latest.results.map((r) => r.engine)));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{brand.name} — prompts</h1>
      <Card>
        <CardContent>
          <PromptMatrix
            brandName={brand.name}
            prompts={prompts.map((p) => ({ id: p.id, text: p.text, intent: p.intent }))}
            engines={engines}
            results={latest.results}
          />
        </CardContent>
      </Card>
    </div>
  );
}
