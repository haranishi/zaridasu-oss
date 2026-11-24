# 審査とモデレーション — いまの仕様

> 「いま何が正しいか」だけを書く。「そのとき何を変えたか」は `docs/requirements/REQ-*.md`（履歴）。
> 食い違ったら**コードが正**。各節に正本のファイルを書いてある。

投稿そのものの扱いは [posts.md](./posts.md) を先に読むこと。ここでは審査・通報・コメント・監査ログを扱う。

## 管理者とは

**`app_metadata.role === 'admin'` の人**。これだけ。専用テーブルもフラグ列もない。

判定は 3 層でそれぞれ独立に行う。どれか 1 つに頼らない。

| 層 | 場所 |
| --- | --- |
| middleware | `src/lib/supabase/middleware.ts` |
| 管理画面のレイアウト（SSR） | `src/app/admin/(protected)/layout.tsx` |
| DB の RLS | `supabase/schema.sql` の `admin_*` ポリシー（`auth.jwt()` を直接読む） |

`app_metadata` は利用者が書き換えられない領域なので、クライアントの状態を信用しなくて済む。**`user_metadata` と間違えないこと**（あちらは本人が書ける）。

## 投稿の審査

`pending` → `approved` / `rejected`。詳しくは [posts.md](./posts.md#審査)。

**利用者が INSERT 時に運用列を送ってきても、トリガーが全部リセットする。** `status` / `rejection_*` / `reviewed_*` / `auto_approved` / `is_official` / `is_flagged` / `ai_result` / `ai_analyzed_at` と、公開レベル `location_disclosure`（種ごとの既定で上書き。ただし投稿者が `hidden`＝位置の非公開を選んだときだけ尊重する・REQ-329）。**つまりクライアントから送られた値は信用していない。** 正本: `supabase/schema.sql`

## AI判定と自動審査

写真と音声は Edge Function（`analyze-image` / `analyze-audio`）が判定し、結果は `ai_result` に入る。
**条件を満たすとservice roleで `approved` / `rejected` を書く。** 自動承認時は `auto_approved: true`。
一般利用者のINSERTでこの値を指定しても `false` に戻されることと、Edgeによる自動審査は別の経路。
種の一致・適切さ・信頼度・品質や、画像と音声の組合せで判断する。情報不足や矛盾等は手動判断へ残す。
写真が1枚でも分析に失敗したら自動承認せず、適切性は不明（明示的な不適切があればfalse）とする。
判定の流用はサーバーが原本から計算したSHA-256と、過去の `ai_result` の検証済みハッシュが一致する場合だけ。
条件と閾値、再分析時の状態変更は [AI分析の案内](../architecture/notifications-ai-analysis.md) と両関数の実装を参照する。

通常のAI判定はpostsのINSERTトリガーから起動する。新規投稿後にクライアントから追加invokeしない。
検証済みの本人または管理者による再分析は、別の認可経路で行う。

## 通報

誰でも通報できる。理由は `spam` / `wrong_location` / `inappropriate` / `other` の 4 つ。

**未解決の通報が 3 件たまると、その投稿に自動で `is_flagged` が立つ**（トリガー `flag_post_on_reports`）。フラグは管理画面で目立たせるためのもので、公開停止はしない。止めるかどうかは管理者が決める。

**通報者の IP はサーバー側で記録する。** クライアントから送られた値は破棄してサーバーが観測した IP で上書きする（`set_report_reporter_ip`）。IP 単位のスロットルを信用できる値で回すため。`reporter_ip` は列レベルで保護してあり、一般利用者は読めない。

通報の閲覧・解決は管理者だけ。正本: `supabase/schema.sql`

## コメント

**閲覧は誰でも、投稿はログインした人だけ、削除は本人。** 管理者は管理画面から消せる。

投稿の削除に対してコメントは CASCADE で消える。

## 監査ログ

管理操作は `audit_logs` に残す。画面側の `writeAuditLog` に加え、DBトリガー・管理RPCによる記録経路がある。

画面側の `writeAuditLog` は、DBがエラーを返した場合にログへ記録する。DBトリガー等の失敗時の扱いは各関数に従う。

**読めるのも書けるのも管理者だけ。** 利用者からは存在ごと見えない。

記録する操作は承認・却下・削除・公式フラグの切り替えなど。新しい管理操作では、DB側の監査と画面側の記録を併せて確認する。

## 書き込みで必ず守ること

**RLS 拒否は 0 行更新で「成功」として返る。** 影響行数を数えないと、権限が無いのに「承認しました」と出る。詳細と対処は [posts.md](./posts.md#書き込みで必ず守ること)。

## 関連

- 実装 — `src/lib/data/posts-admin.ts`（審査・削除）・`src/lib/auditLog.ts`
- 管理画面 — `src/views/admin/`
- 履歴 — `docs/requirements/`。通報の IP は REQ-212、列レベル保護は REQ-179 / REQ-208
