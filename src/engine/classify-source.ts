export type SourceType =
  | "own_site"
  | "competitor_site"
  | "review_site"
  | "directory"
  | "reddit"
  | "youtube"
  | "news"
  | "wiki"
  | "social"
  | "other";

const REVIEW_SITES = new Set([
  "google.com",
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "practo.com",
  "justdial.com",
  "zomato.com",
  "tripadvisor.com",
  "glassdoor.com",
  "ambitionbox.com",
]);

const DIRECTORIES = new Set([
  "yelp.com",
  "sulekha.com",
  "indiamart.com",
  "clutch.co",
  "goodfirms.co",
  "producthunt.com",
  "crunchbase.com",
]);

const SOCIAL = new Set(["linkedin.com", "instagram.com", "x.com", "twitter.com", "facebook.com"]);

/** Strips subdomains down to registrable-domain-ish form for lookup, e.g. "www.g2.com" -> "g2.com". */
function rootDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.toLowerCase();
  }
}

export interface ClassifyContext {
  brandDomain?: string;
  competitorDomains?: string[];
}

export function classifySource(url: string, ctx: ClassifyContext = {}): SourceType {
  const domain = domainOf(url);
  const root = rootDomain(domain);

  if (ctx.brandDomain && matchesDomain(domain, ctx.brandDomain)) return "own_site";
  if (ctx.competitorDomains?.some((d) => matchesDomain(domain, d))) return "competitor_site";

  // google.com/maps is a review surface; other google.com paths aren't classified here by host alone,
  // but for our purposes (business listings/reviews) treating google.com as review_site is the useful default.
  if (REVIEW_SITES.has(root)) return "review_site";
  if (DIRECTORIES.has(root)) return "directory";
  if (root === "reddit.com") return "reddit";
  if (root === "youtube.com" || root === "youtu.be") return "youtube";
  if (root === "wikipedia.org") return "wiki";
  if (SOCIAL.has(root)) return "social";
  if (isLikelyNews(root)) return "news";

  return "other";
}

export function isSameDomain(domain: string, target: string): boolean {
  return matchesDomain(domain, target);
}

function matchesDomain(domain: string, target: string): boolean {
  const t = target.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  return domain === t || domain.endsWith(`.${t}`) || t.endsWith(`.${domain}`);
}

const NEWS_HINTS = [
  "news",
  "times",
  "post",
  "herald",
  "tribune",
  "chronicle",
  "reuters.com",
  "bloomberg.com",
  "techcrunch.com",
];

function isLikelyNews(root: string): boolean {
  return NEWS_HINTS.some((hint) => root.includes(hint));
}
