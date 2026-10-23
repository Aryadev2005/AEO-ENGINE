const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
export const PLACES_CONFIGURED = Boolean(GOOGLE_PLACES_API_KEY);

const BASE_URL = "https://places.googleapis.com/v1/places";

export interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string;
}

export interface PlaceReview {
  authorName: string;
  rating: number | null;
  text: string;
  relativeTime: string;
}

export interface PlaceDetails {
  rating: number | null;
  userRatingCount: number | null;
  reviews: PlaceReview[];
}

async function placesRequest(path: string, init: RequestInit, fieldMask: string): Promise<unknown> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY not configured");
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": fieldMask,
    },
  });
  if (!res.ok) {
    throw new Error(`Places API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

export async function searchPlaces(query: string): Promise<PlaceCandidate[]> {
  const json = (await placesRequest(
    ":searchText",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textQuery: query, pageSize: 5 }),
    },
    "places.id,places.displayName,places.formattedAddress",
  )) as { places?: { id: string; displayName?: { text?: string }; formattedAddress?: string }[] };

  return (json.places ?? []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text ?? "Unknown",
    address: p.formattedAddress ?? "",
  }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const json = (await placesRequest(
    `/${placeId}`,
    { method: "GET" },
    "id,rating,userRatingCount,reviews",
  )) as {
    rating?: number;
    userRatingCount?: number;
    reviews?: {
      authorAttribution?: { displayName?: string };
      rating?: number;
      text?: { text?: string };
      relativePublishTimeDescription?: string;
    }[];
  };

  return {
    rating: json.rating ?? null,
    userRatingCount: json.userRatingCount ?? null,
    reviews: (json.reviews ?? []).slice(0, 5).map((r) => ({
      authorName: r.authorAttribution?.displayName ?? "Anonymous",
      rating: r.rating ?? null,
      text: r.text?.text ?? "",
      relativeTime: r.relativePublishTimeDescription ?? "",
    })),
  };
}

export function reviewLinkFor(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
