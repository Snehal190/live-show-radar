import { z } from "zod";
import { DEFAULT_ALERT_EMAIL } from "@/lib/alerts/email-policy";

/**
 * Environment contract. DATABASE_URL and CRON_SECRET are hard requirements: the app
 * cannot do anything without them, so startup fails loudly. The external-service keys
 * (Gemini, SerpApi, Resend) are validated when present, and their absence is logged
 * loudly at startup — the app keeps rendering cached data and uses non-AI fallbacks,
 * which the acceptance checklist requires ("still renders with keys removed").
 */
const optionalKey = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const boolFlag = z
  .string()
  .optional()
  .transform((v) => (v ?? "").toLowerCase() === "true");

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Neon pooled connection string)"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be a long random string (>= 16 chars)"),
  GEMINI_API_KEY: optionalKey,
  GEMINI_API_KEYS: optionalKey,
  GEMINI_MODEL: optionalKey,
  EVENTS_PROVIDER: z.enum(["serpapi", "searchapi", ""]).optional().transform((v) => (v ? v : undefined)),
  SERPAPI_API_KEY: optionalKey,
  SEARCHAPI_API_KEY: optionalKey, // optional backup provider (SearchApi.io Google Events)
  SERPAPI_MONTHLY_QUOTA: z.coerce.number().int().positive().default(250),
  RESEND_API_KEY: optionalKey,
  ALERT_EMAIL: optionalKey.pipe(z.email().optional()).transform((v) => v ?? DEFAULT_ALERT_EMAIL),
  EMAIL_FROM: z.string().trim().default("onboarding@resend.dev"),
  APP_URL: z
    .string()
    .trim()
    .default("http://localhost:3000")
    .transform((v) => v.replace(/\/+$/, "")),
  EMAIL_DRY_RUN: boolFlag,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`\n[env] Invalid environment configuration:\n${issues}\nSee .env.example.\n`);
  }
  cached = parsed.data;
  return cached;
}

/** Called once from instrumentation.ts so misconfiguration shows up at boot, not mid-request. */
export function validateEnvAtStartup(): void {
  const env = getEnv();
  const missing: string[] = [];
  if (!hasGemini()) missing.push("GEMINI_API_KEY/GEMINI_MODEL (AI copy, matching, web scan → fallbacks)");
  if (!env.SERPAPI_API_KEY) missing.push("SERPAPI_API_KEY (live SerpApi sync disabled)");
  if (!env.RESEND_API_KEY && !env.EMAIL_DRY_RUN) missing.push("RESEND_API_KEY (emails will be logged, not sent)");
  if (missing.length > 0) {
    console.warn(`\n[env] ⚠️  Running in degraded mode. Missing:\n${missing.map((m) => `  - ${m}`).join("\n")}\n`);
  }
}

/** All configured Gemini keys (GEMINI_API_KEY first, then GEMINI_API_KEYS), de-duplicated. */
export function geminiKeys(): string[] {
  const env = getEnv();
  const all = [env.GEMINI_API_KEY, ...(env.GEMINI_API_KEYS ?? "").split(",")].map((k) => (k ?? "").trim()).filter(Boolean);
  return [...new Set(all)];
}

export function hasGemini(): boolean {
  return Boolean(getEnv().GEMINI_MODEL) && geminiKeys().length > 0;
}

/** Google Events provider: SerpApi keys are 64 hex chars; SearchApi.io keys are shorter. */
export function eventsProvider(): "serpapi" | "searchapi" {
  const env = getEnv();
  if (env.EVENTS_PROVIDER) return env.EVENTS_PROVIDER;
  return /^[a-f0-9]{64}$/i.test(env.SERPAPI_API_KEY ?? "") ? "serpapi" : "searchapi";
}
