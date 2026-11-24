# REQ-105: Supabase Browser Client 実装の統合（dual 解消）

> 親 REQ: REQ-092
> 関連 REQ: REQ-037（rsc-supabase-client-unify）— 同主旨。本 REQ は具体実装版

## 背景
ザリダスには **同じ責務の Supabase Browser Client が 2 つ並存**している：

1. `src/lib/supabase.ts` — Proxy 経由の lazy シングルトン + `signInWithGoogle` 補助関数
2. `src/lib/supabase/client.ts` — 単純な `createClient()` factory

REQ-037 で「統合せよ」と要件定義済みだが未実装。流派が混在し、新規開発者がどちらを使うか迷う温床。

## 現状の問題
- `src/lib/supabase.ts:1-20` が Proxy + lazy 初期化で実装。大半の Hook / View はこれを `import { supabase }` で利用
- `src/lib/supabase/client.ts:1-8` は単純 factory `createClient()`。RSC 移行を想定して新設されたが、現状ほぼ使われていない
- 同一責務のクライアントが 2 系統 → コードレビューでどちらを使うかの判断ノイズ
- 将来の HMR / SSR 境界で問題化する可能性（Proxy パターンは Next.js 15 + React 19 で warnings 出る場合あり）

## 目的
Browser Client を 1 系統（`src/lib/supabase/client.ts`）に統合し、`src/lib/supabase.ts` を廃止する。

## 要件

### 機能要件
- [ ] FR-105-01: `src/lib/supabase.ts` の Proxy パターンを廃止し、`src/lib/supabase/client.ts` の `createClient()` をシングルトン化したものに統合
- [ ] FR-105-02: 統合後の API は `import { supabase } from '@/lib/supabase/client'` で呼び出せること（既存の流派を踏襲）
- [ ] FR-105-03: `signInWithGoogle` 等のヘルパー関数は `src/lib/auth/google.ts`（または同等）に移動
- [ ] FR-105-04: 既存の全 import（`from '@/lib/supabase'`）を `from '@/lib/supabase/client'` に一括置換
- [ ] FR-105-05: `src/lib/supabase.ts` を削除
- [ ] FR-105-06: `src/lib/supabase/{server,middleware}.ts` は無変更（RSC 用 / middleware 用は分離維持）

### 非機能要件
- [ ] NFR-105-01: 既存テスト全て pass
- [ ] NFR-105-02: ビルド時の HMR / hydration warning 0 件
- [ ] NFR-105-03: ランタイム挙動（認証・クエリ）に変化なし

## 受入条件
- [ ] AC-01: `src/lib/supabase.ts` ファイルが存在しない
- [ ] AC-02: `grep -rn "from '@/lib/supabase'" src/` がヒット 0 件（client/server/middleware の subdir パスは除く）
- [ ] AC-03: `npm run build` 成功 + 全テスト pass
- [ ] AC-04: 認証 / 投稿 / 詳細 / コメントの動作が回帰しない（手動 or Playwright で確認）
- [ ] AC-05: `signInWithGoogle` のエクスポート位置が新しい場所に移動し、import が更新されている

## 影響範囲
- `src/lib/supabase.ts`（削除）
- `src/lib/supabase/client.ts`（シングルトン化に拡張）
- `src/lib/auth/google.ts`（新規 — `signInWithGoogle` 移動先）
- 全ての import 文（一括置換 — 推定 30〜50 ファイル）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 直接の機能影響は無いが、コードベースの一貫性を保つことで将来のレビュー / リファクタリング工数を恒常的に下げる。M 規模（半日〜1 日）。

## 実装メモ
- 一括置換コマンド：
  ```bash
  rg -l "from '@/lib/supabase'" src/ \
    | xargs sed -i '' "s|from '@/lib/supabase'|from '@/lib/supabase/client'|g"
  ```
- `signInWithGoogle` の移動は import を 1 箇所変えるだけで済むはず（呼び出し元 1 箇所と仮定）
- シングルトン化の実装例：
  ```ts
  // src/lib/supabase/client.ts
  import { createBrowserClient } from '@supabase/ssr'
  import type { SupabaseClient } from '@supabase/supabase-js'

  let _client: SupabaseClient | null = null
  export function createClient(): SupabaseClient {
    if (_client) return _client
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    return _client
  }
  export const supabase = new Proxy({} as SupabaseClient, {
    get(_, prop) { return (createClient() as never)[prop] },
  })
  ```
- Proxy を残すか直接 export するかは選択。残す場合は HMR で再評価される懸念があるため、`if (!_client)` の lazy 初期化が必須
