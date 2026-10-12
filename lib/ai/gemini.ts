import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { geminiKeys, getEnv, hasGemini } from "@/lib/env";
import { errorText, finishLog, startLog } from "@/lib/server/synclog";
import { withRetry, withTimeout } from "@/lib/server/timeout";

const clients = new Map<string, GoogleGenAI>();
let cursor = 0;

function client(key: string): GoogleGenAI {
  let c = clients.get(key);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key });
    clients.set(key, c);
  }
  return c;
}

/** Keys in round-robin order starting at the next one, so load spreads across keys. */
function keyOrder(): string[] {
  const keys = geminiKeys();
  const start = cursor++ % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

/** Quota, auth and overload errors move on to the next key; anything else is a real failure. */
function shouldFailover(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|RESOURCE_EXHAUSTED|quota|401|403|UNAUTHENTICATED|PERMISSION_DENIED|API key|503|UNAVAILABLE|overloaded/i.test(msg);
}

export interface GroundingSource {
  uri: string;
  title: string | null;
}

export type GeminiResult<T> =
  | { ok: true; data: T; sources: GroundingSource[]; model: string }
  | { ok: false; error: string };

/** Strip ``` fences / prose around a JSON payload and parse it. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("No JSON found in model output");
  }
}

interface Options<S extends z.ZodType> {
  label: string;
  system?: string;
  prompt: string;
  schema: S;
  grounded?: boolean;
  timeoutMs?: number;
  logKind?: "gemini" | "gemini_web";
}

/**
 * One Gemini Flash call: timeout + one retry + zod validation + sync_log row.
 * Grounded calls (Google Search tool) can't enforce a response schema, so JSON is
 * requested in plain text and parsed defensively. Never throws: callers use fallbacks.
 */
export async function geminiJson<S extends z.ZodType>(opts: Options<S>): Promise<GeminiResult<z.infer<S>>> {
  if (!hasGemini()) return { ok: false, error: "Gemini not configured" };
  const model = getEnv().GEMINI_MODEL as string;
  const logId = await startLog(opts.logKind ?? "gemini", { description: `${opts.label} · ${model}`, trigger: "engine" }).catch(() => null);
  try {
    const call = (key: string) =>
      withTimeout(opts.label, opts.timeoutMs ?? 25_000, async (signal) => {
        const res = await client(key).models.generateContent({
          model,
          contents: opts.prompt,
          config: {
            systemInstruction: opts.system,
            abortSignal: signal,
            temperature: opts.grounded ? 0.2 : 0.8,
            ...(opts.grounded
              ? { tools: [{ googleSearch: {} }] }
              : { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(opts.schema, { target: "draft-7" }) }),
          },
        });
        const text = res.text ?? "";
        const parsed = opts.schema.safeParse(extractJson(text));
        if (!parsed.success) throw new Error(`Invalid JSON shape: ${parsed.error.issues[0]?.message ?? "unknown"}`);
        const sources: GroundingSource[] = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
          .map((c) => ({ uri: c.web?.uri ?? "", title: c.web?.title ?? null }))
          .filter((s) => s.uri);
        return { data: parsed.data as z.infer<S>, sources };
      });
    const result = await withRetry(async () => {
      let last: unknown;
      for (const key of keyOrder()) {
        try {
          return await call(key);
        } catch (e) {
          last = e;
          if (!shouldFailover(e)) throw e;
        }
      }
      throw last;
    });
    if (logId) await finishLog(logId, { resultsCount: Array.isArray(result.data) ? result.data.length : 1 }).catch(() => {});
    return { ok: true, data: result.data, sources: result.sources, model };
  } catch (e) {
    const error = errorText(e);
    console.error(`[gemini] ${opts.label} failed:`, error);
    if (logId) await finishLog(logId, { error }).catch(() => {});
    return { ok: false, error };
  }
}
