import type { FactBlock } from "@/lib/alerts/facts";

export interface EmailInput {
  headline: string;
  line: string;
  urgency: string;
  facts: FactBlock;
  lineup?: string[]; // festival alerts
  verdict?: { verdict: string; reason: string } | null;
  showUrl: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const VERDICT_LABEL: Record<string, string> = { go: "GO ✈️", think: "THINK 🤔", skip: "SKIP" };

/** Simple, mobile-friendly HTML + plain text. Every fact is rendered from the database. */
export function renderEmail(i: EmailInput): { subject: string; html: string; text: string } {
  const f = i.facts;
  const accent = i.urgency === "critical" ? "#FF4500" : "#FF8A50";
  const rows: [string, string][] = [
    ["Artist", i.lineup && i.lineup.length > 1 ? i.lineup.join(", ") : f.artist],
    ["Event", f.event],
    ["Venue", f.venue],
    ["City", f.city],
    ["Date", f.date],
    ["Early-bird", f.earlyBird],
  ];
  if (f.prices) rows.push(["Prices", f.prices]);
  const tags = f.tags.map((t) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;border-radius:999px;border:1px solid #444;color:#ddd;font-size:12px">${esc(t)}</span>`).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#050505;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#f5f5f5">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
  <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#888">Live Show Radar · ${esc(i.urgency)}</div>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:26px;line-height:1.25;margin:10px 0 8px;color:#fff">${esc(i.headline)}</h1>
  <p style="font-size:16px;line-height:1.5;color:#ccc;margin:0 0 18px">${esc(i.line)}</p>
  <div style="border:1px solid #222;border-left:3px solid ${accent};border-radius:14px;background:#111;padding:16px 16px 10px">
    ${tags ? `<div style="margin-bottom:8px">${tags}</div>` : ""}
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows
        .map(
          ([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#888;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 0;color:${k === "Early-bird" && f.earlyBirdUrgent ? accent : "#eee"};font-weight:${k === "Early-bird" && f.earlyBirdUrgent ? 700 : 400}">${esc(v)}</td></tr>`,
        )
        .join("")}
    </table>
  </div>
  ${
    i.verdict
      ? `<div style="margin-top:14px;border:1px solid #222;border-radius:14px;background:#111;padding:14px 16px"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#888">Worth the trip?</div><div style="font-size:18px;font-weight:700;margin:4px 0;color:${accent}">${esc(VERDICT_LABEL[i.verdict.verdict] ?? i.verdict.verdict)}</div><div style="color:#ccc;font-size:14px;line-height:1.5">${esc(i.verdict.reason)}</div></div>`
      : ""
  }
  <p style="margin:18px 0 6px;font-size:14px;color:#ddd">🎟️ ${f.ticket.url ? `<a href="${esc(f.ticket.url)}" style="color:${accent}">${esc(f.ticket.label)}</a>` : esc(f.ticket.label)}</p>
  ${f.sourceUrl ? `<p style="margin:0 0 18px;font-size:12px;color:#777">Source: <a href="${esc(f.sourceUrl)}" style="color:#999">${esc(f.sourceUrl.replace(/^https?:\/\//, "").slice(0, 60))}</a></p>` : ""}
  <a href="${esc(i.showUrl)}" style="display:inline-block;margin-top:6px;padding:13px 22px;border-radius:999px;background:#fff;color:#000;text-decoration:none;font-weight:600;font-size:14px">Open in Live Show Radar</a>
  <p style="margin-top:26px;font-size:11px;color:#555">Facts come from the Radar database; the witty bits come from Gemini Flash. Simulated early-birds are labelled.</p>
</div></body></html>`;

  const text = [
    i.headline,
    i.line,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(f.tags.length ? [`Tags: ${f.tags.join(", ")}`] : []),
    ...(i.verdict ? ["", `Worth the trip? ${i.verdict.verdict.toUpperCase()} — ${i.verdict.reason}`] : []),
    "",
    `Where to buy: ${f.ticket.label}${f.ticket.url ? ` — ${f.ticket.url}` : ""}`,
    ...(f.sourceUrl ? [`Source: ${f.sourceUrl}`] : []),
    "",
    `Open in Live Show Radar: ${i.showUrl}`,
  ].join("\n");

  return { subject: i.headline, html, text };
}
