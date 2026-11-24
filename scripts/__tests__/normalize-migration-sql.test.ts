// @vitest-environment node

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'
import {
  hashSql,
  normalizeSql,
  stripSqlComments,
} from '../normalize-migration-sql.mjs'

describe('normalize-migration-sql — コメント除去', () => {
  it('-- 行コメントだけの差を除去する', () => {
    expect(hashSql('SELECT 1;')).toBe(hashSql('-- 説明\nSELECT 1; -- 補足\n'))
  })

  it('/* */ ブロックコメントだけの差を除去する', () => {
    expect(hashSql('SELECT 1;')).toBe(hashSql('/* 説明 */ SELECT 1 /* 補足 */;'))
  })

  it('ネストしたブロックコメントを外側の終端まで除去する', () => {
    expect(normalizeSql('SELECT /* outer /* nested */ still outer */ 1;')).toBe('SELECT 1')
  })

  it('stripSqlComments はコメントを除去し、引用領域内の記号を残す', () => {
    const sql = `-- leading
SELECT '-- value', "-- identifier", $$-- function body$$;
/* trailing */`

    const stripped = stripSqlComments(sql)
    expect(stripped).not.toContain('leading')
    expect(stripped).not.toContain('trailing')
    expect(stripped).toContain("'-- value'")
    expect(stripped).toContain('"-- identifier"')
    expect(stripped).toContain('$$-- function body$$')
  })
})

describe('normalize-migration-sql — 引用領域の保護', () => {
  it('$$ ... $$ の関数本体にある -- を削除せず、本体の変更を検知する', () => {
    const original = `CREATE FUNCTION test() RETURNS void AS $$
BEGIN
  -- 関数本体のコメント
  RETURN;
END;
$$ LANGUAGE plpgsql;`
    const changed = original.replace('関数本体のコメント', '変更されたコメント')

    expect(stripSqlComments(original)).toContain('-- 関数本体のコメント')
    expect(hashSql(original)).not.toBe(hashSql(changed))
  })

  it('$tag$ ... $tag$ の中にあるコメント記号を削除しない', () => {
    const sql = 'SELECT $body$ -- keep\n /* keep too */ $body$; -- remove\n'
    const stripped = stripSqlComments(sql)

    expect(stripped).toContain('$body$ -- keep\n /* keep too */ $body$')
    expect(stripped).not.toContain('remove')
  })

  it("文字列リテラル内の -- と '' エスケープを削除しない", () => {
    const sql = "SELECT 'It''s -- これはコメントではない'; -- remove\n"
    const stripped = stripSqlComments(sql)

    expect(stripped).toContain("'It''s -- これはコメントではない'")
    expect(stripped).not.toContain('remove')
  })

  it("E'...' のバックスラッシュエスケープ後も文字列内を保護する", () => {
    const sql = String.raw`SELECT E'quote \' -- keep'; -- remove
SELECT 1;`
    const stripped = stripSqlComments(sql)

    expect(stripped).toContain(String.raw`E'quote \' -- keep'`)
    expect(stripped).not.toContain('remove')
    expect(stripped).toContain('SELECT 1')
  })
})

describe('normalize-migration-sql — ハッシュ比較', () => {
  it('空白・改行・インデントだけの差を吸収する', () => {
    const compact = 'CREATE TABLE example ( id bigint, name text );'
    const formatted = `
      CREATE   TABLE example (
        id bigint,
        name text
      ) ;
    `

    expect(hashSql(compact)).toBe(hashSql(formatted))
  })

  it('SQL 文を1つ追加すると異なるハッシュになる', () => {
    expect(hashSql('SELECT 1;')).not.toBe(hashSql('SELECT 1; SELECT 2;'))
  })

  it('末尾セミコロンの有無を吸収する', () => {
    expect(hashSql('SELECT 1;')).toBe(hashSql('SELECT 1'))
  })
})

describe('normalize-migration-sql — CLI の stdin 読み取り（回帰）', () => {
  // REQ-298: 2026-08-03、CLI が stdin を `raw += chunk` とチャンクごとに文字列化していたため、
  // UTF-8 のマルチバイト文字がチャンク境界で分断されて U+FFFD へ化け、本番の migration が
  // **ランダムに「内容ドリフトあり」と誤検知**された（実行のたびに壊れる migration が変わる）。
  // このゲートは本番デプロイをブロックするので偽陽性は許容できない。
  // 64KiB のチャンク境界を確実にまたぐ日本語入りペイロードを、実際にパイプで流して検証する。
  const cliPath = fileURLToPath(new URL('../normalize-migration-sql.mjs', import.meta.url))
  const workDir = mkdtempSync(join(tmpdir(), 'req298-normalize-'))

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  const runCli = (payload: unknown): { drift: unknown[]; checked: number } => {
    const stdout = execFileSync('node', [cliPath], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    return JSON.parse(stdout) as { drift: unknown[]; checked: number }
  }

  it('64KiB を超える日本語入り SQL をパイプで渡してもドリフト誤検知しない', () => {
    // 1 行あたり日本語 30 文字前後 × 3000 行 ≒ 270KB。チャンク境界を何度もまたぐ。
    const lines: string[] = []
    for (let i = 0; i < 3000; i += 1) {
      lines.push(`-- ${i}: 位置情報プライバシーと逆ジオコーディングの説明コメント（日本語）`)
      lines.push(`SELECT ${i} AS "列名${i}", '文字列リテラル${i}' AS note;`)
    }
    const sql = `${lines.join('\n')}\n`
    const version = '20990101000000'
    writeFileSync(join(workDir, `${version}_large_multibyte.sql`), sql, 'utf8')

    const result = runCli({
      prod: { [version]: sql.replace(/;\s*$/, '') },
      repoDir: workDir,
      ignoreFile: join(workDir, 'nonexistent-ignore.txt'),
    })

    expect(result.checked).toBe(1)
    expect(result.drift).toEqual([])
  })

  it('大きな入力でも実際の差分は検知できる（上のテストが常に緑になる作りでないこと）', () => {
    const version = '20990101000001'
    const base = `${Array.from({ length: 3000 }, (_, i) => `SELECT ${i} AS "列名${i}";`).join('\n')}\n`
    writeFileSync(join(workDir, `${version}_large_changed.sql`), `${base}SELECT 'あとから追加された文';\n`, 'utf8')

    const result = runCli({
      prod: { [version]: base },
      repoDir: workDir,
      ignoreFile: join(workDir, 'nonexistent-ignore.txt'),
    })

    expect(result.checked).toBe(1)
    expect(result.drift).toHaveLength(1)
  })
})
