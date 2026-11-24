# REQ-246: Supabase `Database` 型の配線と `as` キャスト撤去（DB 境界の型安全性回復）

## 背景
本プロジェクトは `tsconfig` が `strict: true` ＋ `noUncheckedIndexedAccess` で、本番コードに明示 `: any` / `as any` / `@ts-nocheck` は皆無という高い型規律を持つ（コード品質監査で確認）。ところが**唯一の大きな例外が Supabase の DB アクセス境界**である。クライアント生成に `Database` 型ジェネリックが配線されておらず、その結果として各 DB 読み取りで型が `any` に潰れ、それを再主張するための `as` キャストが約 40 箇所に散在している。最も厳格であるべき層（DB 境界）で strict TS が実質的に無効化されており、スキーマ変更時にコンパイルエラーで気づけない。

## 現状の問題
（ファイルパス:行番号つき）

### 1. 3 つの Supabase クライアントすべてが `Database` ジェネリック未配線
- `src/lib/supabase/client.ts:10,22` — `createBrowserClient(url, key)` が素の `SupabaseClient` を返す（`<Database>` 無し）。
- `src/lib/supabase/server.ts:7` — `createServerClient(...)` ジェネリック無し。
- `src/lib/supabase/anon.ts:25` — `createSupabaseClient(url, anonKey)` ジェネリック無し。
- `src/types/database.types.ts:1-7` — `Database` 型は**存在する**（ヘッダに `supabase gen types` の記述もある）が、client ジェネリックとしては一度も使われていない（`createBrowserClient<` の grep が 0 ヒット）。

### 2. 結果として約 40 の `as` キャストが型を再主張している
- 例: `src/hooks/useStats.ts:47`（`data as Stats`）、`src/hooks/useProfile.ts:38,127,179,228,265`、`src/components/features/dashboard/MyPostsSection.tsx:104`（`data as MyPost[]`）、`src/components/features/posts/CommentSection.tsx:81`、`src/hooks/useSurveySites.ts:51`、`src/hooks/useAdminStats.ts:118`、`src/hooks/useAdminKpi.ts:146` ほか。
- 開発者自身が根因を明記している: `src/views/DetailPage.tsx:121-125` に「Database 型が未配線…各列は any 推論となり」とコメントし、**二重キャスト** `data as unknown as DetailPost`（:125）＝最も強い型の嘘に至っている。
- **影響**: すべての DB 読み取りが境界で実質 `any`。スキーマ/列名の変更がコンパイルエラーを生まず、`as` を素通りしてランタイムまで到達する。バグが最も高くつく層で strict TS の恩恵が消えている。

### 3. `server.ts` の型ショートカットが `client.ts` と不整合
- `src/lib/supabase/server.ts:8-9` は `process.env.NEXT_PUBLIC_SUPABASE_URL!` / `...ANON_KEY!` の非 null 断言、`:18` は cookie options を `as never` にキャスト。対して `client.ts:16-20` は同じ env を検証して分かりやすいエラーを投げる。env 誤設定時、`server.ts` は不可解なランタイム失敗になる。

### 4. 散発的な小キャスト（一括是正のついでに）
- `src/components/features/posts/AudioRecorder.tsx:219`（`(stopTimerRef.current as unknown) as ReturnType<typeof setTimeout>`）、`src/hooks/useReverseGeocode.ts:61`（`(err as Error).message` の `instanceof` ガード無し）。

## 目的
3 つのクライアントに `Database` 型を配線し、DB 読み取りの型を復元して大半の `as` キャストを撤去する。これにより strict TS の保護を「最も重要な DB 境界」まで届かせ、スキーマ変更をコンパイル時に検知できるようにする。

## 要件

### 機能要件
- [ ] FR-246-01: `client.ts` / `server.ts` / `anon.ts` の生成を `createBrowserClient<Database>(...)` / `createServerClient<Database>(...)` / `createClient<Database>(...)` に修正する。
- [ ] FR-246-02: `src/types/database.types.ts` を**ライブスキーマから再生成**して現状の列と一致させる（現ファイルは「gen types」ヘッダを持つが手保守の疑いがあるため、`schema:check` と整合する形にする）。
- [ ] FR-246-03: 型配線で不要になった `as` キャスト（`.from(x).select(...)` の素直な読み取り約 90%）を撤去する。**正当な例外**＝ PostgREST の埋め込み行（`DetailPage` の `comments(*)` / `likes(...)` 等）のみ、**狭く・コメント付きの**キャストを残す。二重キャスト（`as unknown as`）は解消する。
- [ ] FR-246-04: `server.ts` を `client.ts` と同じ env 検証ガードに統一し、cookie アダプタを `@supabase/ssr` の `CookieOptions` 型で受ける（`as never` 撤去）。
- [ ] FR-246-05: `AudioRecorder.tsx:219` のタイマー ref を `ReturnType<typeof setTimeout> | null` で型付け、`useReverseGeocode.ts:61` を `instanceof Error` ガードにする。

### 非機能要件
- [ ] NFR-246-01: 変更後 `type-check`（`tsc --noEmit`）・`lint`（`--max-warnings 0`）・`test` がすべて green。撤去したキャストの箇所でランタイム挙動が変わらないこと（純粋な型の付け直し）。
- [ ] NFR-246-02: `database.types.ts` の再生成手順（`supabase gen types` 相当）を運用ドキュメント化し、スキーマ変更時に型も更新する運用にする（`schema:check` と併走）。
- [ ] NFR-246-03: バンドルサイズ・実行時性能に影響を与えないこと（型のみの変更）。

## 受入条件
- [ ] AC-01: 3 クライアントが `<Database>` 付きで生成され、`grep 'createBrowserClient<'` 等がヒットする。
- [ ] AC-02: `DetailPage.tsx` の二重キャストが解消され、DB 読み取りの `as` キャストが埋め込み行の狭い例外を除き撤去されている。
- [ ] AC-03: 列名をわざと改名すると `type-check` がエラーになる（＝コンパイル時にスキーマ不整合を検知できる）ことをサンプルで確認。
- [ ] AC-04: `type-check` / `lint` / `test` が green で回帰なし。
- [ ] AC-05: `server.ts` が env 未設定時に `client.ts` 同様の明示エラーを出し、`as never` が無い。

## 影響範囲
- `src/lib/supabase/{client,server,anon}.ts`、`src/types/database.types.ts`
- 約 40 箇所の `as` キャスト保有ファイル（`useProfile`/`useStats`/`useAdminStats`/`useAdminKpi`/`MyPostsSection`/`CommentSection`/`useSurveySites`/`DetailPage` ほか）
- `src/components/features/posts/AudioRecorder.tsx`、`src/hooks/useReverseGeocode.ts`
- 関連 REQ: REQ-209（コード品質）、REQ-241/244（schema:check と整合）、REQ-247（テスト整備と併走）。

## 優先度
- **緊急度**: Medium / **重要度**: High
- **理由**: 機能不全ではないが、最も厳格であるべき DB 境界で strict TS が無効化され、スキーマ変更が静かにランタイムへ抜ける構造的リスク。1 つのジェネリック配線で約 40 の型の嘘を一掃でき、費用対効果が非常に高い。以後のスキーマ変更（本監査群の migration 追加含む）を安全にする土台になる。
