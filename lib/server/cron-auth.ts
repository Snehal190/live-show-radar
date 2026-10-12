import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/** Every /api/cron/* call needs `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron sends it automatically). */
export function isAuthorizedCron(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${getEnv().CRON_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
