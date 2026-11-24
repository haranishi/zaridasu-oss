# REQ-103: `select('*')` を全廃して列指定に統一

> 親 REQ: REQ-092
> 関連 REQ: REQ-032（data-fetching-optimization）

## 背景
ザリダスの Supabase クエリ 32 箇所のうち **10 箇所が `select('*')`** で運用されている。必要列だけ取得していないため：
- egress 帯域・JSON パースコストが膨らむ
- 将来 PII 列（IP アドレス・モデレーション履歴）を `posts` 等に追加した瞬間に **クライアントへ漏洩**するリスクが顕在化
- フロントエンドの型推論も弱くなる（全列が `any` 寄り）

REQ-032 で「列指定」が要件としてうたわれているが、実装は未着手。

## 現状の問題
| ファイル | 行 | 用途 |
|---|---|---|
| `src/app/post/[id]/page.tsx` | 13 | metadata 生成 |
| `src/app/post/[id]/page.tsx` | 56 | 画面レンダリング |
| `src/views/DetailPage.tsx` | 68 | 詳細画面初期 fetch |
| `src/views/admin/AdminPostsPage.tsx` | 223 | 投稿レビュー一覧 |
| `src/components/features/posts/CommentSection.tsx` | 47 | コメント取得 |
| `src/components/features/dashboard/MyPostsSection.tsx` | 74 | マイ投稿 |
| `src/hooks/useCsvExport.ts` | 40 | CSV 出力 |
| `src/hooks/useProfile.ts` | 125 | プロフィール |
| `src/hooks/useSurveyRequests.ts` | 66 | 調査依頼一覧 |
| `src/hooks/useSurveyRequests.ts` | 162 | 調査依頼詳細 |

## 目的
全クエリで必要列のみを取得し、egress を削減 + 列追加時の漏洩耐性を獲得する。

## 要件

### 機能要件
- [ ] FR-103-01: 上記 10 箇所すべてで `select('*')` を `select('id, ...')` 形式に書き換える
- [ ] FR-103-02: 各箇所で実際に消費されているプロパティを参照側コードから抽出し、列リストを過不足なく決定する
- [ ] FR-103-03: 一覧系（AdminPostsPage / MyPostsSection / SurveyRequests 一覧）はサムネイル列のみで、本文・全 photos などは詳細遷移時に追加 fetch する設計を検討
- [ ] FR-103-04: ESLint カスタムルールまたは grep を含む CI チェックで `\.select\('\*'\)` の出現を 0 件にする

### 非機能要件
- [ ] NFR-103-01: 全クエリで egress が現状以下になること（DevTools Network で目視確認可能）
- [ ] NFR-103-02: 既存テスト（vitest / Playwright）が pass すること
- [ ] NFR-103-03: TypeScript の型エラーが発生しないこと（database.types.ts の partial type を活用）

## 受入条件
- [ ] AC-01: `grep -rn "select('\*')" src/` の結果が 0 件
- [ ] AC-02: CI または pre-commit hook で `select('\*')` を検出する仕組みが追加されている
- [ ] AC-03: 主要画面（ホーム / 詳細 / ダッシュボード / admin/posts）のネットワークタブで Supabase レスポンスサイズが現状から削減
- [ ] AC-04: `npm run build` が成功し、TypeScript 型エラー 0
- [ ] AC-05: 既存 Playwright E2E が pass

## 影響範囲
- 上記 10 ファイル
- `src/types/database.types.ts`（変更不要、partial type を活用）
- `package.json`（grep CI チェック script 追加 — 任意）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: パフォーマンス改善 + セキュリティ予防の二重効果。1 PR で 10 箇所修正可能（M 規模）。

## 実装メモ
- 列リストを決める際は、各ファイルの参照箇所を `grep -n "post\." src/views/DetailPage.tsx` 等で洗い出す
- `posts` テーブルの典型的な必要列：`id, species, info_type, lat, lng, municipality, comment, count, observed_at, created_at, photos, audio_url, status, user_id`
- 詳細ページでは追加で `species_confidence, ai_analysis_result` 等
- 一覧ページでは画像列はサムネイル URL（`toThumbnailUrl(photos[0])`）のみ取得
- Embed（FK join）も活用：`select('id, ..., comments(id, body, created_at)')` で N+1 解消（→ REQ-113 と連動）
