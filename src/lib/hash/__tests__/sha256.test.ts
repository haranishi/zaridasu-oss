// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { sha256Hex } from '../sha256'

// REQ-247 / REQ-267: dedup 用 SHA-256 の回帰テスト。
// jsdom の crypto.subtle は Node のバージョンによって digest が未実装/破損しており（CI の Node 20 で
// sha256Hex が null を返し 3 件が落ちていた）、jsdom の Blob と webcrypto の realm 相性にも依存する。
// 本テストは DOM に一切依存しないため node 環境で実行し、Node ネイティブの Blob + webcrypto
// （Node 20/24 いずれでも digest が正しく動く）を使うことで環境差を排除する。本番はブラウザの
// crypto.subtle を使う（挙動は同一の SHA-256）。

describe('sha256Hex', () => {
  it('既知ベクトル "abc" の SHA-256 を hex で返す', async () => {
    const hex = await sha256Hex(new Blob(['abc']))
    expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('空入力の SHA-256（既知ベクトル）', async () => {
    const hex = await sha256Hex(new Blob([]))
    expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('同一バイト列は同一 hash（dedup 用途）', async () => {
    const a = await sha256Hex(new Blob(['zaridasu']))
    const b = await sha256Hex(new Blob(['zaridasu']))
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it('arrayBuffer 取得失敗時は null を返す（既存挙動: hash NULL で続行）', async () => {
    const broken = { arrayBuffer: () => Promise.reject(new Error('boom')) } as unknown as Blob
    expect(await sha256Hex(broken)).toBeNull()
  })
})
