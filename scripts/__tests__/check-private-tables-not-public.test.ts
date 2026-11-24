// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  ALLOWED_FUNCTIONS,
  checkFindings,
  checkRepository,
  listPublicCodeFiles,
  scanCode,
  scanSql,
  splitStatements,
} from '../check-private-tables-not-public.mjs'

/** 許可リストどおりの関数とトリガーを持つ最小の SQL（ここに足して壊す）。 */
const BASE = `
CREATE OR REPLACE FUNCTION public.check_survey_plan_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM count(*) FROM public.survey_plans; RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.check_survey_plan_stop_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM count(*) FROM public.survey_plan_stops; RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.check_rare_sighting_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM count(*) FROM public.rare_sightings; RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.reorder_survey_plan_stops(p_plan_id uuid, p_stop_ids uuid[]) RETURNS void LANGUAGE plpgsql AS $$
BEGIN UPDATE public.survey_plan_stops SET sort_order = 0 WHERE plan_id = p_plan_id; END; $$;
REVOKE EXECUTE ON FUNCTION public.reorder_survey_plan_stops(uuid, uuid[]) FROM PUBLIC, anon;
CREATE TRIGGER a BEFORE UPDATE ON public.survey_plans FOR EACH ROW EXECUTE FUNCTION public.protect_survey_plan_columns();
CREATE TRIGGER b BEFORE UPDATE ON public.survey_plan_stops FOR EACH ROW EXECUTE FUNCTION public.protect_survey_plan_stop_columns();
CREATE TRIGGER c BEFORE UPDATE ON public.rare_sightings FOR EACH ROW EXECUTE FUNCTION public.protect_rare_sighting_columns();
CREATE TRIGGER d BEFORE INSERT OR UPDATE ON public.rare_sightings FOR EACH ROW EXECUTE FUNCTION public.check_rare_sighting_photo_paths();
CREATE TRIGGER e BEFORE UPDATE ON public.rare_sightings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER f BEFORE INSERT ON public.survey_plans FOR EACH ROW EXECUTE FUNCTION public.check_survey_plan_rate_limit();
CREATE TRIGGER g BEFORE INSERT ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.check_water_report_input();
CREATE TRIGGER h BEFORE INSERT ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.check_water_report_rate_limit();
CREATE TRIGGER i AFTER DELETE ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.delete_water_report_publication();
CREATE TRIGGER j BEFORE INSERT OR UPDATE ON public.survey_plans FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
CREATE FUNCTION public.review_water_report(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM count(*) FROM public.water_reports; END; $$;
REVOKE EXECUTE ON FUNCTION public.review_water_report(uuid) FROM PUBLIC, anon;
`

function problemsFor(sql: string) {
  return checkFindings(scanSql('schema.sql', sql), sql)
}

describe('check-private-tables-not-public — 合格の形', () => {
  it('許可リストどおりなら問題なし', () => {
    expect(problemsFor(BASE)).toEqual([])
  })

  it('実際のリポジトリ（schema.sql と migrations）は許可リストと一致する', () => {
    const { files, problems } = checkRepository(process.cwd())
    expect(files.length).toBeGreaterThan(10)
    expect(problems).toEqual([])
  })

  it('表の名前がコメントにあるだけ・似た名前（survey_requests・接頭辞つき）では引っかけない', () => {
    const sql = `${BASE}
-- rare_sightings を読む関数はここには無い
CREATE OR REPLACE FUNCTION public.get_stats() RETURNS bigint LANGUAGE sql AS $$
  -- 希少種（rare_sightings）は数えない
  SELECT count(*) FROM public.survey_requests JOIN idx_rare_sightings_stop ON true $$;`
    expect(problemsFor(sql)).toEqual([])
  })
})

describe('check-private-tables-not-public — 壊したら落ちる', () => {
  it('公開の関数（get_user_ranking）の本文が希少種の表を読むと落ちる', () => {
    const sql = `${BASE}
CREATE OR REPLACE FUNCTION get_user_ranking(p_limit INTEGER DEFAULT 20) RETURNS TABLE (n bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT count(*) FROM rare_sightings;
END;
$$;`
    const problems = problemsFor(sql)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('get_user_ranking')
    expect(problems[0]).toMatch(/schema\.sql:\d+/)
  })

  it('動的 SQL の文字列の中でも見つける', () => {
    const sql = `${BASE}
CREATE FUNCTION public.weekly_digest() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN EXECUTE 'SELECT * FROM public."survey_plans"'; END; $f$;`
    expect(problemsFor(sql).join('\n')).toContain('weekly_digest')
  })

  it('非公開の表のトリガーが許可リストに無い関数を呼ぶと落ちる（NEW を他の表へ写す抜け道）', () => {
    const sql = `${BASE}
CREATE TRIGGER copy_out AFTER INSERT ON rare_sightings FOR EACH ROW EXECUTE PROCEDURE public.copy_to_posts();`
    const problems = problemsFor(sql)
    expect(problems.join('\n')).toContain('copy_to_posts')
    expect(problems.join('\n')).toContain('rare_sightings のトリガー')
  })

  it('非公開の表を参照するビューは落ちる', () => {
    const sql = `${BASE}
CREATE OR REPLACE VIEW public.rare_map AS SELECT lat, lng FROM public.rare_sightings;`
    expect(problemsFor(sql).join('\n')).toContain('ビュー rare_map')
  })

  it('許可リストの関数が見つからなくなったら落ちる（許可リストを腐らせない）', () => {
    const sql = BASE.replace(/CREATE TRIGGER e [^\n]*\n/, '')
    expect(problemsFor(sql).join('\n')).toContain('update_updated_at が見つかりません')
  })

  it('RPC の EXECUTE を anon から外す行が無いと落ちる', () => {
    const sql = BASE.replace('FROM PUBLIC, anon;', 'FROM PUBLIC;')
    expect(problemsFor(sql).join('\n')).toContain('reorder_survey_plan_stops の EXECUTE')
  })

  it('許可リストは 14 本（増やすときは理由を書く）', () => {
    expect(Object.keys(ALLOWED_FUNCTIONS)).toHaveLength(14)
    for (const reason of Object.values(ALLOWED_FUNCTIONS)) expect(reason.length).toBeGreaterThan(5)
  })
})

describe('check-private-tables-not-public — 文の分け方', () => {
  it('ドル引用・引用符・コメントの中の ; では切らず、文の最初のコード行を返す', () => {
    const sql = "-- 見出し\n\nSELECT ';' AS a; /* ; */\nCREATE FUNCTION f() RETURNS int AS $x$ SELECT 1; $x$ LANGUAGE sql;\nSELECT \"a;b\";"
    const statements = splitStatements(sql)
    expect(statements.map((s) => s.line)).toEqual([3, 3, 5])
    expect(statements[1]?.text).toContain('$x$ SELECT 1; $x$')
  })
})

// REQ-330 点検 B11: 公開の経路のコード（Edge Functions・src/app/api・route.ts）も見る。
// service_role で動く Edge Function が rare_sightings を読めば、RLS に関係なく漏れる。
describe('check-private-tables-not-public — 公開の経路のコード', () => {
  it('Edge Functions・src/app/api・公開データの route.ts を対象にし、テストは外す', () => {
    const files = listPublicCodeFiles(process.cwd())
    expect(files.some((f) => f.startsWith('supabase/functions/'))).toBe(true)
    expect(files.some((f) => f.startsWith('src/app/api/'))).toBe(true)
    expect(files).toContain('src/app/dataset/zaridasu.csv/route.ts')
    expect(files.some((f) => /\.test\.|__tests__/.test(f))).toBe(false)
  })

  it('4 表と写真置き場の名前が出てきたら、その行を返す', () => {
    const source = [
      "import { createClient } from 'npm:@supabase/supabase-js'",
      "const { data } = await admin.from('rare_sightings').select('*')",
      "const url = admin.storage.from('rare-photos').getPublicUrl(path)",
      "const plans = await admin.from(\"survey_plans\").select('id')",
    ].join('\n')
    expect(scanCode('supabase/functions/x/index.ts', source)).toEqual([
      { name: 'rare_sightings', where: 'supabase/functions/x/index.ts:2' },
      { name: 'rare-photos', where: 'supabase/functions/x/index.ts:3' },
      { name: 'survey_plans', where: 'supabase/functions/x/index.ts:4' },
    ])
  })

  it('コメントの中・似た名前（接頭辞つき・別の表）では引っかけない。行番号はずらさない', () => {
    const source = [
      '// rare_sightings はここでは読まない',
      '/* survey_plan_stops も',
      '   読まない */',
      "const a = 'my_rare_sightings_backup'",
      "const b = 'survey_requests'",
      "const c = 'https://example.com//rare'",
      "const d = admin.from('survey_stop_posts')",
    ].join('\n')
    expect(scanCode('src/app/api/x/route.ts', source)).toEqual([{ name: 'survey_stop_posts', where: 'src/app/api/x/route.ts:7' }])
  })

  it('非公開水域報告・写真も公開経路から参照できない', () => {
    expect(scanCode('src/app/api/x/route.ts', "const a = db.from('water_reports')\nconst b = db.storage.from('water-report-photos')")).toEqual([
      { name: 'water_reports', where: 'src/app/api/x/route.ts:1' },
      { name: 'water-report-photos', where: 'src/app/api/x/route.ts:2' },
    ])
    expect(problemsFor(`${BASE}\nCREATE VIEW water_public AS SELECT lat, lng FROM water_reports;`).join('\n')).toContain('ビュー water_public')
  })
})
