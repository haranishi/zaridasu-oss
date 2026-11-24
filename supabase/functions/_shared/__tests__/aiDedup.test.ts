// REQ-129 FR-129-08: aiDedup の単体テスト
//
// 旧 findImageDedup は ai_result 全体を返していたため、過去投稿の audio_analysis や
// combined_decision が画像 dedup 経由で新規投稿に転写されるバグがあった。本テストは
// 修正後の findImageDedup が:
//   - audio_analysis のみ持つ過去投稿を採用しない (画像判定が無いため)
//   - image_analysis を持つ過去投稿では image_analysis のみを返す (audio_analysis 等を
//     混入させない)
//   - 旧形式 (トップレベル detected_species 等) も拾える (後方互換)
//   - species が異なる過去投稿は採用しない (防御層)
// ことを保証する。
//
// 実行: `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/__tests__/aiDedup.test.ts`

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import { findImageDedup } from "../aiDedup.ts";

// AI_DEDUP_ENABLED が false なら全部スキップされるため、明示的に有効化する。
Deno.env.set("AI_DEDUP_ENABLED", "true");
// LOOKBACK を十分長く取ってテストデータの ai_analyzed_at が範囲内になるようにする。
Deno.env.set("AI_DEDUP_LOOKBACK_DAYS", "3650");

// --------------------------------------------------------------------
// モック Supabase クライアント
// --------------------------------------------------------------------

interface MockRow {
  id: string;
  ai_result: Record<string, unknown> | null;
  ai_analyzed_at: string;
  image_hashes: string[];
  species: string;
}

interface MockQueryState {
  table: string;
  filters: {
    contains?: { col: string; value: unknown };
    eq?: Array<{ col: string; value: unknown }>;
    neq?: { col: string; value: unknown };
    gte?: { col: string; value: unknown };
    or?: string;
  };
  limit?: number;
}

function mockSupabase(rows: MockRow[], capture?: { state: MockQueryState | null }) {
  return {
    from(table: string) {
      const state: MockQueryState = { table, filters: {} };
      if (capture) capture.state = state;
      const query = {
        select(_cols: string) {
          return query;
        },
        // 実際の PostgREST と同じ制約にしてある。jsonb の包含は filter('cs', JSON 文字列) で渡す。
        // `.contains(col, 配列)` は `cs.{a,b}` になり 22P02 で失敗するので、この模擬には contains() を置かない
        // （置くと、実機で毎回失敗する書き方が試験を通ってしまう）。
        filter(col: string, op: string, value: unknown) {
          if (op !== "cs" || typeof value !== "string") throw new Error("jsonb の包含は filter(col, 'cs', JSON 文字列) で書くこと");
          state.filters.contains = { col, value: JSON.parse(value) };
          return query;
        },
        eq(col: string, value: unknown) {
          if (!state.filters.eq) state.filters.eq = [];
          state.filters.eq.push({ col, value });
          return query;
        },
        neq(col: string, value: unknown) {
          state.filters.neq = { col, value };
          return query;
        },
        gte(col: string, value: unknown) {
          state.filters.gte = { col, value };
          return query;
        },
        or(expr: string) {
          state.filters.or = expr;
          return query;
        },
        order(_col: string, _opts?: unknown) {
          return query;
        },
        limit(_n: number) {
          state.limit = _n;
          // フィルタを適用したデータを返す
          let filtered = rows;
          if (state.filters.contains) {
            const arr = state.filters.contains.value as unknown[];
            filtered = filtered.filter((r) =>
              arr.every((h) => (state.filters.contains!.col === "image_hashes" ? r.image_hashes : r.ai_result?.image_sha256s as string[] | undefined)?.includes(h as string))
            );
          }
          if (state.filters.eq) {
            for (const { col, value } of state.filters.eq) {
              if (col === "species") {
                filtered = filtered.filter((r) => r.species === value);
              }
            }
          }
          if (state.filters.neq) {
            const { col, value } = state.filters.neq;
            if (col === "id") {
              filtered = filtered.filter((r) => r.id !== value);
            }
          }
          return Promise.resolve({ data: filtered, error: null });
        },
      };
      return query;
    },
  };
}

// --------------------------------------------------------------------
// テスト本体
// --------------------------------------------------------------------

Deno.test(
  "FR-129-08: audio_analysis のみ持つ過去投稿は findImageDedup の対象外",
  async () => {
    // 観測されたバグ: 音声付き過去投稿 (image_analysis は無い) が image_hash 一致で hit し、
    // ai_result 全体が転写されて新規投稿に audio_analysis が混入していた。
    const rows: MockRow[] = [
      {
        id: "past-audio-only",
        ai_result: {
          image_sha256s: ["hash-A"],
          audio_analysis: {
            detected_species: "bullfrog",
            species_match: true,
            confidence: 1,
            analyzed_at: "2026-04-24T00:00:00Z",
          },
        },
        ai_analyzed_at: "2026-04-24T00:00:00Z",
        image_hashes: ["hash-A"],
        species: "american",
      },
    ];
    const supabase = mockSupabase(rows);
    const result = await findImageDedup(supabase, ["hash-A"], "new-post", "american");
    assertEquals(result.found, false);
  },
);

Deno.test(
  "FR-129-08: image_analysis を持つ過去投稿は image_analysis のみ返す (audio_analysis を含まない)",
  async () => {
    const rows: MockRow[] = [
      {
        id: "past-with-image",
        ai_result: {
          image_sha256s: ["hash-B"],
          image_analysis: {
            detected_species: "american",
            species_match: true,
            confidence: 0.92,
            image_quality: "good",
            is_appropriate: true,
            concerns: [],
            notes: "OK",
            analyzed_at: "2026-05-10T00:00:00Z",
          },
          audio_analysis: {
            detected_species: "bullfrog",
            confidence: 0.88,
          },
          combined_decision: {
            should_approve: true,
            should_reject: false,
            reason: "both_modalities_match",
          },
        },
        ai_analyzed_at: "2026-05-10T00:00:00Z",
        image_hashes: ["hash-B"],
        species: "american",
      },
    ];
    const supabase = mockSupabase(rows);
    const result = await findImageDedup(supabase, ["hash-B"], "new-post", "american");
    assert(result.found, "image_analysis を持つ過去投稿は dedup hit するはず");
    if (!result.found) return;
    assertEquals(result.sourcePostId, "past-with-image");
    assertEquals(result.analysis.detected_species, "american");
    assertEquals(result.analysis.species_match, true);
    assertEquals(result.analysis.confidence, 0.92);
    // 音声・統合判定は絶対に含めない
    assertEquals(
      (result.analysis as Record<string, unknown>).audio_analysis,
      undefined,
    );
    assertEquals(
      (result.analysis as Record<string, unknown>).combined_decision,
      undefined,
    );
  },
);

Deno.test(
  "FR-129-08: 同じ image_hash でも species が違う過去投稿は採用しない (防御層)",
  async () => {
    const rows: MockRow[] = [
      {
        id: "past-different-species",
        ai_result: {
          image_sha256s: ["hash-C"],
          image_analysis: {
            detected_species: "bullfrog",
            species_match: true,
            confidence: 0.95,
            analyzed_at: "2026-05-10T00:00:00Z",
          },
        },
        ai_analyzed_at: "2026-05-10T00:00:00Z",
        image_hashes: ["hash-C"],
        species: "bullfrog",
      },
    ];
    const supabase = mockSupabase(rows);
    // 新規投稿は species=american なのに過去は bullfrog → hit させない
    const result = await findImageDedup(supabase, ["hash-C"], "new-post", "american");
    assertEquals(result.found, false);
  },
);

Deno.test(
  "FR-129-08: 旧形式 (top-level detected_species) も pickImageFields で吸収して返す",
  async () => {
    const rows: MockRow[] = [
      {
        id: "past-legacy",
        ai_result: {
          image_sha256s: ["hash-D"],
          // 旧形式: image_analysis nest が無く、トップレベルに画像判定フィールドがある
          detected_species: "american",
          species_match: true,
          confidence: 0.88,
          image_quality: "acceptable",
          is_appropriate: true,
          concerns: [],
          notes: "旧形式",
          photo_count: 1,
          analyzed_count: 1,
          // 旧形式でもこれらは画像スコープ外 → 除外されるべき
          model: "gemini-2.5-flash-lite",
          analyzed_at: "2026-04-01T00:00:00Z",
        },
        ai_analyzed_at: "2026-04-01T00:00:00Z",
        image_hashes: ["hash-D"],
        species: "american",
      },
    ];
    const supabase = mockSupabase(rows);
    const result = await findImageDedup(supabase, ["hash-D"], "new-post", "american");
    assert(result.found, "旧形式の過去投稿も dedup hit するはず");
    if (!result.found) return;
    assertEquals(result.analysis.detected_species, "american");
    assertEquals(result.analysis.species_match, true);
    assertEquals(result.analysis.confidence, 0.88);
    assertEquals(result.analysis.image_quality, "acceptable");
    assertEquals(result.analysis.is_appropriate, true);
    assertEquals(result.analysis.photo_count, 1);
    assertEquals(result.analysis.analyzed_count, 1);
    // 画像スコープ外フィールドは除外されている
    assertEquals((result.analysis as Record<string, unknown>).model, undefined);
    assertEquals(
      (result.analysis as Record<string, unknown>).analyzed_at,
      undefined,
    );
  },
);

Deno.test(
  "FR-129-08: claimedSpecies が null/undefined なら hit させない (誤マッチ防止)",
  async () => {
    const rows: MockRow[] = [
      {
        id: "past-any",
        ai_result: {
          image_sha256s: ["hash-E"],
          image_analysis: { detected_species: "american", confidence: 0.9 },
        },
        ai_analyzed_at: "2026-05-10T00:00:00Z",
        image_hashes: ["hash-E"],
        species: "american",
      },
    ];
    const supabase = mockSupabase(rows);
    const r1 = await findImageDedup(supabase, ["hash-E"], "new-post", null);
    assertEquals(r1.found, false);
    const r2 = await findImageDedup(supabase, ["hash-E"], "new-post", "");
    assertEquals(r2.found, false);
    const r3 = await findImageDedup(supabase, ["hash-E"], "new-post", undefined);
    assertEquals(r3.found, false);
  },
);

Deno.test(
  "FR-129-02: 画像判定済みフィルタ (image_analysis or detected_species 必須) が PostgREST `or` クエリに反映される",
  async () => {
    const capture = { state: null as MockQueryState | null };
    const supabase = mockSupabase([], capture);
    await findImageDedup(supabase, ["hash-X"], "new-post", "american");
    assert(capture.state !== null);
    assert(
      capture.state!.filters.or?.includes("ai_result->image_analysis.not.is.null"),
      `or クエリに image_analysis フィルタが含まれていない: ${capture.state!.filters.or}`,
    );
    assert(
      capture.state!.filters.or?.includes("ai_result->detected_species.not.is.null"),
      `or クエリに top-level detected_species フィルタが含まれていない: ${capture.state!.filters.or}`,
    );
  },
);

Deno.test(
  "FR-129-03: species フィルタがクエリに反映される",
  async () => {
    const capture = { state: null as MockQueryState | null };
    const supabase = mockSupabase([], capture);
    await findImageDedup(supabase, ["hash-Y"], "new-post", "american");
    assert(capture.state !== null);
    const speciesEq = capture.state!.filters.eq?.find((e) => e.col === "species");
    assert(speciesEq, "species フィルタが追加されていない");
    assertEquals(speciesEq.value, "american");
  },
);

Deno.test('security: 申告ハッシュだけの投稿は流用せず、検証済み配列の順序・長さを守る', async () => {
  const row: MockRow = { id: 'past', species: 'american', image_hashes: ['a', 'b'], ai_analyzed_at: new Date().toISOString(), ai_result: { detected_species: 'american', confidence: 0.99 } }
  assertEquals((await findImageDedup(mockSupabase([row]), ['a', 'b'], 'new', 'american')).found, false)
  row.ai_result!.image_sha256s = ['b', 'a']
  assertEquals((await findImageDedup(mockSupabase([row]), ['a', 'b'], 'new', 'american')).found, false)
  row.ai_result!.image_sha256s = ['a', 'b', 'c']
  assertEquals((await findImageDedup(mockSupabase([row]), ['a', 'b'], 'new', 'american')).found, false)
  row.ai_result!.image_sha256s = ['a', 'b']
  const capture = { state: null as MockQueryState | null }
  assertEquals((await findImageDedup(mockSupabase([row], capture), ['a', 'b'], 'new', 'american')).found, true)
  assertEquals(capture.state?.filters.contains?.col, 'ai_result->image_sha256s')
})
