import "server-only";
import { Resend } from "resend";
import { getEnv } from "@/lib/env";
import { withTimeout } from "@/lib/server/timeout";

let client: Resend | undefined;

export type SendResult = { ok: true; id: string | null; dryRun: boolean } | { ok: false; error: string };

export async function sendEmail(msg: { subject: string; html: string; text: string; idempotencyKey: string }): Promise<SendResult> {
  const env = getEnv();
  if (env.EMAIL_DRY_RUN) {
    console.log(`[email:dry-run] → ${env.ALERT_EMAIL ?? "(no ALERT_EMAIL)"} | ${msg.subject}\n${msg.text}\n`);
    return { ok: true, id: null, dryRun: true };
  }
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) return { ok: false, error: "Resend not configured (RESEND_API_KEY / ALERT_EMAIL)" };
  client ??= new Resend(env.RESEND_API_KEY);
  try {
    const { data, error } = await withTimeout("resend", 15_000, () =>
      (client as Resend).emails.send(
        { from: `Live Show Radar <${env.EMAIL_FROM}>`, to: env.ALERT_EMAIL as string, subject: msg.subject, html: msg.html, text: msg.text },
        { idempotencyKey: msg.idempotencyKey },
      ),
    );
    if (error) return { ok: false, error: `${error.name}: ${error.message}` };
    return { ok: true, id: data?.id ?? null, dryRun: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
