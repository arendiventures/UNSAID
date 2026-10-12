import type Database from "better-sqlite3";

export type RetrievedPassage = {
  passageId: string;
  sourceId: string;
  seq: number;
  text: string;
  locator: string;
  score: number;
  duplicateOf: string | null;
  duplicateIds: string[];
  source: {
    title: string;
    authorOrg: string;
    publishedAt: string;
    url: string;
    sourceType: string;
    isPublic: boolean;
  };
};

export type RetrievalResult = {
  query: string;
  ftsQuery: string;
  passages: RetrievedPassage[];
  totalMatches: number;
  method: "lexical_fts5_bm25";
};

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have he her his how i if in is it its of on or she so that the their them there these they this to was we were what when where which who why will with you your did do does about tell me can could would should into than then over under up down out not no yes just really ever never always".split(
    " ",
  ),
);

/** Turn free-form host speech into a safe FTS5 query: quoted terms OR-ed, prefix matching on longer terms. */
export function buildFtsQuery(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  const unique = [...new Set(tokens)].slice(0, 24);
  if (unique.length === 0) return "";
  return unique
    .map((t) => {
      const safe = t.replace(/"/g, "");
      return safe.length >= 5 ? `"${safe}"*` : `"${safe}"`;
    })
    .join(" OR ");
}

type Row = {
  passage_id: string;
  source_id: string;
  seq: number;
  text: string;
  locator: string;
  duplicate_of: string | null;
  score: number;
  title: string;
  author_org: string;
  published_at: string;
  url: string;
  source_type: string;
  is_public: number;
};

/**
 * Lexical retrieval (FTS5 + BM25). Exact-duplicate passages are collapsed onto the
 * canonical copy (the first ingested) but their ids are preserved so the producer can
 * see every source that carries the same text. Conflicting accounts are *not* merged -
 * only byte-identical normalized text is treated as a duplicate.
 */
export function searchPassages(
  sqlite: Database.Database,
  guestId: string,
  query: string,
  opts: { limit?: number; sourceIds?: string[] } = {},
): RetrievalResult {
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 50);
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return { query, ftsQuery, passages: [], totalMatches: 0, method: "lexical_fts5_bm25" };

  const sourceFilter = opts.sourceIds && opts.sourceIds.length > 0 ? `AND p.source_id IN (${opts.sourceIds.map(() => "?").join(",")})` : "";
  const sql = `
    SELECT p.id AS passage_id, p.source_id, p.seq, p.text, p.locator, p.duplicate_of,
           bm25(passages_fts) AS score,
           s.title, s.author_org, s.published_at, s.url, s.source_type, s.is_public
    FROM passages_fts f
    JOIN passages p ON p.rowid = f.rowid
    JOIN sources s ON s.id = p.source_id
    WHERE passages_fts MATCH ? AND p.guest_id = ? ${sourceFilter}
    ORDER BY score
    LIMIT ?`;
  const params: unknown[] = [ftsQuery, guestId, ...(opts.sourceIds ?? []), limit * 3];
  let rows: Row[];
  try {
    rows = sqlite.prepare(sql).all(...params) as Row[];
  } catch (err) {
    // A pathological query string should never take the session down.
    if (err instanceof Error && /fts5/i.test(err.message)) {
      return { query, ftsQuery, passages: [], totalMatches: 0, method: "lexical_fts5_bm25" };
    }
    throw err;
  }

  const byCanonical = new Map<string, RetrievedPassage>();
  for (const r of rows) {
    const canonicalId = r.duplicate_of ?? r.passage_id;
    const existing = byCanonical.get(canonicalId);
    if (existing) {
      if (!existing.duplicateIds.includes(r.passage_id) && r.passage_id !== existing.passageId) existing.duplicateIds.push(r.passage_id);
      continue;
    }
    byCanonical.set(canonicalId, {
      passageId: r.passage_id,
      sourceId: r.source_id,
      seq: r.seq,
      text: r.text,
      locator: r.locator,
      score: r.score,
      duplicateOf: r.duplicate_of,
      duplicateIds: r.duplicate_of ? [r.duplicate_of] : [],
      source: {
        title: r.title,
        authorOrg: r.author_org,
        publishedAt: r.published_at,
        url: r.url,
        sourceType: r.source_type,
        isPublic: r.is_public === 1,
      },
    });
    if (byCanonical.size >= limit) break;
  }
  return { query, ftsQuery, passages: [...byCanonical.values()], totalMatches: rows.length, method: "lexical_fts5_bm25" };
}

export function getPassagesByIds(sqlite: Database.Database, ids: string[]): RetrievedPassage[] {
  if (ids.length === 0) return [];
  const rows = sqlite
    .prepare(
      `SELECT p.id AS passage_id, p.source_id, p.seq, p.text, p.locator, p.duplicate_of, 0 AS score,
              s.title, s.author_org, s.published_at, s.url, s.source_type, s.is_public
       FROM passages p JOIN sources s ON s.id = p.source_id WHERE p.id IN (${ids.map(() => "?").join(",")})`,
    )
    .all(...ids) as Row[];
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .sort((a, b) => (order.get(a.passage_id) ?? 0) - (order.get(b.passage_id) ?? 0))
    .map((r) => ({
      passageId: r.passage_id,
      sourceId: r.source_id,
      seq: r.seq,
      text: r.text,
      locator: r.locator,
      score: 0,
      duplicateOf: r.duplicate_of,
      duplicateIds: [],
      source: {
        title: r.title,
        authorOrg: r.author_org,
        publishedAt: r.published_at,
        url: r.url,
        sourceType: r.source_type,
        isPublic: r.is_public === 1,
      },
    }));
}
