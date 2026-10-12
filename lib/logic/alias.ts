import { normalize } from "./text";

export interface ArtistNames {
  id: string;
  name: string;
  aliases: readonly string[];
}

export interface AliasMatch {
  artistId: string;
  matched: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fast whole-word alias match against an event title. Returns every followed artist in
 * the title (festival lineups can name several). Longer names win over contained shorter
 * ones ("Stewart Copeland & Ricky Kej" beats "Ricky Kej" for the same span).
 */
export function aliasMatches(title: string, artists: readonly ArtistNames[]): AliasMatch[] {
  const hay = ` ${normalize(title)} `;
  const found: { artistId: string; matched: string; start: number; end: number }[] = [];
  for (const a of artists) {
    const names = [a.name, ...a.aliases].map(normalize).filter((n) => n.length >= 3);
    for (const n of names.sort((x, y) => y.length - x.length)) {
      const m = new RegExp(` ${escapeRe(n)} `).exec(hay);
      if (m) {
        found.push({ artistId: a.id, matched: n, start: m.index, end: m.index + n.length });
        break;
      }
    }
  }
  // Drop a match fully contained in a longer match by another artist.
  const kept = found.filter(
    (f) => !found.some((o) => o !== f && o.artistId !== f.artistId && o.start <= f.start && o.end >= f.end && o.end - o.start > f.end - f.start),
  );
  return kept.map(({ artistId, matched }) => ({ artistId, matched }));
}
