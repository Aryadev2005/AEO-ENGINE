import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const id = (name = "id") => text(name).primaryKey();
const createdAt = () =>
  timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  timestamp("updated_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date());

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["free", "starter", "growth", "agency"] })
    .notNull()
    .default("free"),
  monthlyBudgetUsd: doublePrecision("monthly_budget_usd").notNull().default(1),
  country: text("country", { enum: ["IN", "GLOBAL"] })
    .notNull()
    .default("GLOBAL"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable("memberships", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  role: text("role", { enum: ["owner", "member"] })
    .notNull()
    .default("member"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const brands = pgTable("brands", {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  website: text("website"),
  category: text("category"),
  city: text("city"),
  country: text("country"),
  description: text("description"),
  googlePlaceId: text("google_place_id"),
  // Drives the weekly-by-default cron scheduler (spec §5, §8 /api/cron/run-due).
  schedule: text("schedule", { enum: ["off", "weekly", "daily"] })
    .notNull()
    .default("off"),
  nextScanAt: timestamp("next_scan_at", { mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const competitors = pgTable("competitors", {
  id: id(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id),
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  website: text("website"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const prompts = pgTable("prompts", {
  id: id(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id),
  text: text("text").notNull(),
  intent: text("intent", {
    enum: ["discovery", "comparison", "alternative", "review", "local"],
  })
    .notNull()
    .default("discovery"),
  isActive: boolean("is_active").notNull().default(true),
  source: text("source", { enum: ["manual", "generated"] })
    .notNull()
    .default("manual"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scans = pgTable("scans", {
  id: id(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id),
  status: text("status", { enum: ["queued", "running", "done", "failed"] })
    .notNull()
    .default("queued"),
  trigger: text("trigger", { enum: ["manual", "schedule", "checker"] })
    .notNull()
    .default("manual"),
  engines: jsonb("engines").$type<string[]>().notNull().default([]),
  startedAt: timestamp("started_at", { mode: "date" }),
  finishedAt: timestamp("finished_at", { mode: "date" }),
  estCostUsd: doublePrecision("est_cost_usd"),
  actualCostUsd: doublePrecision("actual_cost_usd"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scanResults = pgTable("scan_results", {
  id: id(),
  scanId: text("scan_id")
    .notNull()
    .references(() => scans.id),
  promptId: text("prompt_id")
    .notNull()
    .references(() => prompts.id),
  engine: text("engine").notNull(),
  model: text("model").notNull(),
  answerText: text("answer_text").notNull(),
  latencyMs: integer("latency_ms").notNull().default(0),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  brandMentioned: boolean("brand_mentioned").notNull().default(false),
  brandPosition: integer("brand_position"),
  brandSentiment: text("brand_sentiment", { enum: ["positive", "neutral", "negative"] }),
  brandContext: text("brand_context"),
  entities: jsonb("entities")
    .$type<{ name: string; position: number; isBrand: boolean; competitorId: string | null }[]>()
    .notNull()
    .default([]),
  suggestedCompetitors: jsonb("suggested_competitors").$type<string[]>().notNull().default([]),
  failed: boolean("failed").notNull().default(false),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const citations = pgTable("citations", {
  id: id(),
  scanResultId: text("scan_result_id")
    .notNull()
    .references(() => scanResults.id),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  title: text("title"),
  sourceType: text("source_type", {
    enum: [
      "own_site",
      "competitor_site",
      "review_site",
      "directory",
      "reddit",
      "youtube",
      "news",
      "wiki",
      "social",
      "other",
    ],
  }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scores = pgTable("scores", {
  id: id(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id),
  scanId: text("scan_id")
    .notNull()
    .references(() => scans.id),
  engine: text("engine").notNull(), // EngineId or "all"
  visibilityPct: doublePrecision("visibility_pct").notNull(),
  avgPosition: doublePrecision("avg_position"),
  shareOfVoicePct: doublePrecision("share_of_voice_pct").notNull(),
  citationSharePct: doublePrecision("citation_share_pct").notNull(),
  sentimentScore: doublePrecision("sentiment_score"),
  overallScore: doublePrecision("overall_score").notNull(),
  computedAt: timestamp("computed_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recommendations = pgTable("recommendations", {
  id: id(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id),
  scanId: text("scan_id").references(() => scans.id),
  type: text("type", {
    enum: [
      "get_listed",
      "faq_page",
      "comparison_page",
      "schema",
      "llms_txt",
      "community",
      "reviews",
      "reputation",
    ],
  }).notNull(),
  title: text("title").notNull(),
  why: text("why").notNull(),
  priority: text("priority", { enum: ["high", "med", "low"] }).notNull(),
  status: text("status", { enum: ["open", "done", "dismissed"] })
    .notNull()
    .default("open"),
  generatedContent: text("generated_content"),
  contentFormat: text("content_format", { enum: ["markdown", "json-ld", "text"] }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const reviewSnapshots = pgTable("review_snapshots", {
  id: id(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id),
  rating: doublePrecision("rating"),
  reviewCount: integer("review_count"),
  fetchedAt: timestamp("fetched_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  recentReviews: jsonb("recent_reviews").$type<unknown[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const leads = pgTable("leads", {
  id: id(),
  businessName: text("business_name").notNull(),
  category: text("category"),
  city: text("city"),
  email: text("email"),
  whatsapp: text("whatsapp"),
  checkerResultId: text("checker_result_id"),
  utm: jsonb("utm").$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const checkerResults = pgTable("checker_results", {
  id: id(),
  cacheKey: text("cache_key").notNull().unique(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const llmCalls = pgTable("llm_calls", {
  id: id(),
  workspaceId: text("workspace_id"),
  purpose: text("purpose", { enum: ["scan", "extract", "generate", "checker"] }).notNull(),
  engine: text("engine").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  ok: boolean("ok").notNull().default(true),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const jobs = pgTable("jobs", {
  id: id(),
  type: text("type", { enum: ["scan", "generate_recs", "fetch_reviews"] }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status", { enum: ["queued", "running", "done", "failed"] })
    .notNull()
    .default("queued"),
  attempts: integer("attempts").notNull().default(0),
  runAfter: timestamp("run_after", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  lockedAt: timestamp("locked_at", { mode: "date" }),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
