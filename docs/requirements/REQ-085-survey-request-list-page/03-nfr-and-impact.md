## 非機能要件

### パフォーマンス
- 初回 LCP **3 秒以内**（モバイル 4G 想定）
- フィルタ切替時の再 fetch は **デバウンス 300ms**
- 200 件 fetch + render で **CLS 0.1 以下**

### アクセシビリティ
- フィルタは キーボード操作可能（Tab / Enter / Space）
- カードは `<a>` または `<Link>` でラップしてスクリーンリーダー対応
- 緊急度バッジは色 + テキスト + emoji の三重表現（色覚多様性対応）
- 件数の動的更新は `aria-live="polite"`

### SEO
- `/requests` のメタタグは静的（Server Component で定義）
- title: 「調査依頼一覧 — ザリダス」
- description: 秋田県内の外来種調査依頼一覧
- structured data は本 Phase ではスコープ外

### セキュリティ
- 既存 SELECT RLS により未ログイン閲覧可
- owner=me フィルタは **クライアント側で user.id を埋めるだけ**で、RLS が真の防衛線

---

## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `src/app/requests/page.tsx`（新規） | App Router エントリ、メタタグ、Server Component |
| `src/views/SurveyRequestsListPage.tsx`（新規） | クライアント UI 本体 |
| `src/hooks/useSurveyRequests.ts` | `owner?: 'me'` 引数追加（後方互換） |
| `src/lib/constants.ts` | 市区町村リストが未定義なら追加（既存定数活用が望ましい） |
| `src/views/MyPostsSection.tsx`（既存）| 「自分が立てた依頼」リンクを追加 |
| `src/i18n/*.json` | フィルタラベル等の翻訳キー追加 |
| `src/views/HomePage.tsx`（任意） | ヘッダーや bottom nav に `/requests` 導線追加 |

### DB / API / Storage / マイグレーション
- 変更なし（Phase 1 はクライアント変更のみ）

---
