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
    reviewStatus: string;
  };
  /** "all_terms" when every significant query term matched; "any_term" for the recall fallback. */
  matchMode: "all_terms" | "any_term";
};

export type RetrievalResult = {
  query: string;
  ftsQuery: string;
  passages: RetrievedPassage[];
  totalMatches: number;
  method: "lexical_fts5_bm25";
  strategy: "all_terms" | "any_term" | "mixed" | "none";
};

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have he her his how i if in is it its of on or she so that the their them there these they this to was we were what when where which who why will with you your did do does about tell me can could would should into than then over under up down out not no yes just really ever never always all any some very much more most also been being had".split(
    " ",
  ),
);

/** Significant terms and quoted phrases from free-form host speech. */
export function analyzeQuery(raw: string): { terms: string[]; phrases: string[] } {
  const phrases: string[] = [];
  const withoutPhrases = raw.replace(/"([^"]{2,120})"/g, (_m, p: string) => {
    const cleaned = p.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
    if (cleaned) phrases.push(cleaned);
    return " ";
  });
  const tokens = withoutPhrases
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return { terms: [...new Set(tokens)].slice(0, 24), phrases: phrases.slice(0, 4) };
}

function term(t: string): string {
  const safe = t.replace(/"/g, "");
  return safe.length >= 5 ? `"${safe}"*` : `"${safe}"`;
}

/**
 * Safe FTS5 queries. "all" requires every significant term (and every quoted phrase);
 * "any" is the recall fallback. Quoted phrases are always required.
 */
export function buildFtsQuery(raw: string, mode: "any" | "all" = "any"): string {
  const { terms, phrases } = analyzeQuery(raw);
  const phraseParts = phrases.map((p) => `"${p.replace(/"/g, "")}"`);
  if (terms.length === 0 && phraseParts.length === 0) return "";
  const termPart = terms.length ? (mode === "all" ? terms.map(term).join(" AND ") : `(${terms.map(term).join(" OR ")})`) : "";
  return [...phraseParts, termPart].filter(Boolean).join(" AND ");
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
  review_status: string;
};

function rowToPassage(r: Row, matchMode: "all_terms" | "any_term"): RetrievedPassage {
  return {
    passageId: r.passage_id,
    sourceId: r.source_id,
    seq: r.seq,
    text: r.text,
    locator: r.locator,
    score: r.score,
    duplicateOf: r.duplicate_of,
    duplicateIds: r.duplicate_of ? [r.duplicate_of] : [],
    matchMode,
    source: { title: r.title, authorOrg: r.author_org, publishedAt: r.published_at, url: r.url, sourceType: r.source_type, isPublic: r.is_public === 1, reviewStatus: r.review_status },
  };
}

/**
 * Lexical retrieval (FTS5 + BM25), precision first: passages matching every significant
 * term rank ahead of any-term matches, which are only added to fill the requested limit.
 * Sources marked "excluded" by the producer never surface. Exact-duplicate passages are
 * collapsed onto the canonical copy (first ingested) with their ids preserved; conflicting
 * accounts are never merged - only byte-identical normalized text counts as a duplicate.
 */
export function searchPassages(
  sqlite: Database.Database,
  guestId: string,
  query: string,
  opts: { limit?: number; sourceIds?: string[] } = {},
): RetrievalResult {
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 50);
  const anyQuery = buildFtsQuery(query, "any");
  const allQuery = buildFtsQuery(query, "all");
  const empty: RetrievalResult = { query, ftsQuery: anyQuery, passages: [], totalMatches: 0, method: "lexical_fts5_bm25", strategy: "none" };
  if (!anyQuery) return empty;

  const sourceFilter = opts.sourceIds && opts.sourceIds.length > 0 ? `AND p.source_id IN (${opts.sourceIds.map(() => "?").join(",")})` : "";
  const sql = `
    SELECT p.id AS passage_id, p.source_id, p.seq, p.text, p.locator, p.duplicate_of,
           bm25(passages_fts) AS score,
           s.title, s.author_org, s.published_at, s.url, s.source_type, s.is_public, s.review_status
    FROM passages_fts f
    JOIN passages p ON p.rowid = f.rowid
    JOIN sources s ON s.id = p.source_id
    WHERE passages_fts MATCH ? AND p.guest_id = ? AND s.review_status <> 'excluded' ${sourceFilter}
    ORDER BY score
    LIMIT ?`;
  const run = (fts: string): Row[] => {
    try {
      return sqlite.prepare(sql).all(fts, guestId, ...(opts.sourceIds ?? []), limit * 3) as Row[];
    } catch (err) {
      // A pathological query string should never take the session down.
      if (err instanceof Error && /fts5/i.test(err.message)) return [];
      throw err;
    }
  };

  const byCanonical = new Map<string, RetrievedPassage>();
  const absorb = (rows: Row[], mode: "all_terms" | "any_term") => {
    for (const r of rows) {
      const canonicalId = r.duplicate_of ?? r.passage_id;
      const existing = byCanonical.get(canonicalId);
      if (existing) {
        if (!existing.duplicateIds.includes(r.passage_id) && r.passage_id !== existing.passageId) existing.duplicateIds.push(r.passage_id);
        continue;
      }
      if (byCanonical.size >= limit) break;
      byCanonical.set(canonicalId, rowToPassage(r, mode));
    }
  };

  const allRows = allQuery && allQuery !== anyQuery ? run(allQuery) : [];
  absorb(allRows, "all_terms");
  let anyRows: Row[] = [];
  if (byCanonical.size < limit) {
    anyRows = run(anyQuery);
    absorb(anyRows, "any_term");
  }
  const passages = [...byCanonical.values()];
  const modes = new Set(passages.map((p) => p.matchMode));
  const strategy: RetrievalResult["strategy"] = passages.length === 0 ? "none" : modes.size === 2 ? "mixed" : modes.has("all_terms") ? "all_terms" : "any_term";
  return { query, ftsQuery: strategy === "all_terms" ? allQuery : anyQuery, passages, totalMatches: Math.max(allRows.length, anyRows.length), method: "lexical_fts5_bm25", strategy };
}

export function getPassagesByIds(sqlite: Database.Database, ids: string[]): RetrievedPassage[] {
  if (ids.length === 0) return [];
  const rows = sqlite
    .prepare(
      `SELECT p.id AS passage_id, p.source_id, p.seq, p.text, p.locator, p.duplicate_of, 0 AS score,
              s.title, s.author_org, s.published_at, s.url, s.source_type, s.is_public, s.review_status
       FROM passages p JOIN sources s ON s.id = p.source_id WHERE p.id IN (${ids.map(() => "?").join(",")})`,
    )
    .all(...ids) as Row[];
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.passage_id) ?? 0) - (order.get(b.passage_id) ?? 0)).map((r) => ({ ...rowToPassage(r, "all_terms"), duplicateIds: [] }));
}
