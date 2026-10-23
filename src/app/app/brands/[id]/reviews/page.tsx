import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brands";
import { PLACES_CONFIGURED } from "@/lib/places";
import { getLatestReviewSnapshot, reviewRequestTemplates } from "@/lib/reviews";
import type { PlaceReview } from "@/lib/places";
import { ConnectPlace, ReviewsDashboard } from "./reviews-client";

export default async function BrandReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) notFound();

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) notFound();

  if (!PLACES_CONFIGURED) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">{brand.name} — reviews</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect Google Places</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Set <code>GOOGLE_PLACES_API_KEY</code> to enable ratings, reviews, and review-request
            tools.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!brand.googlePlaceId) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">{brand.name} — reviews</h1>
        <ConnectPlace brandId={brand.id} brandName={brand.name} city={brand.city ?? undefined} />
      </div>
    );
  }

  const snapshot = await getLatestReviewSnapshot(id);
  const templates = reviewRequestTemplates(brand.name, brand.googlePlaceId);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{brand.name} — reviews</h1>
      <ReviewsDashboard
        brandId={brand.id}
        brandName={brand.name}
        rating={snapshot?.rating ?? null}
        reviewCount={snapshot?.reviewCount ?? null}
        reviews={(snapshot?.recentReviews as PlaceReview[] | undefined) ?? []}
        templates={templates}
      />
    </div>
  );
}
