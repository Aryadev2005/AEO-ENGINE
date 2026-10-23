import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brands";
import { listRecommendations } from "@/lib/recommendations";
import { FixesList } from "./fixes-list";

export default async function BrandFixesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) notFound();

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) notFound();

  const recommendations = await listRecommendations(id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{brand.name} — fixes</h1>
      <FixesList
        initial={recommendations.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          why: r.why,
          priority: r.priority,
          status: r.status,
          generatedContent: r.generatedContent,
          contentFormat: r.contentFormat,
        }))}
      />
    </div>
  );
}
