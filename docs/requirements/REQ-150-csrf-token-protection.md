# REQ-150: 状態変更操作の CSRF トークン検証

## これは何か

管理操作（承認/却下・削除・公式切替・通報解決・admin 権限の付与/剥奪）の CSRF 対策が **Cookie の `SameSite=Lax` のみ**に依存している状態に、**CSRF トークン検証を上積みして多層防御にする**要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

管理操作はすべてブラウザ上の Supabase JS クライアントから、Cookie に保存されたセッションを認証情報として直接 Supabase に書き込んでいる。Server Action / Route Handler を経由しないため、リクエストごとの CSRF トークン検証が入る余地が現状ない。`middleware.ts` のコメント（`REQ-019E: Enforce SameSite=Lax and Secure for CSRF protection`）が示すとおり、防御は SameSite だけである。

`SameSite=Lax` は多くのクロスサイト POST を防ぐが、トップレベルナビゲーション由来の GET 系や一部のリクエスト形態を完全には塞がない。ブラウザ実装差や将来の仕様変更にも脆いため、Defense in Depth としてアプリ層のトークン検証を併用する。

## 主要な決定事項の要点

- **一次防御 SameSite ＋ 二次防御トークンの二段構え**にする。`sameSite: 'lax'` と本番の `secure` 設定は**維持**したうえでトークンを追加する。
- **状態変更操作を Server Action または Route Handler 経由に集約する。** 対象は承認/却下・投稿削除（2経路）・公式フラグ切替・コメント削除・通報解決・admin 権限付与/剥奪の7種。検証失敗は 403 で中止。
- **攻撃面を実装で確認してから必須化する。** Supabase セッションが Cookie ベースの SSR セッションであること（middleware が Cookie に書いている事実）を確認し、Cookie 自動送信の攻撃面が存在する前提で設計する。
- **トークン付与は共通ラッパーに寄せる。** 各 admin ページが個別にトークン管理をしない（fetch ラッパー / Server Action の hidden field）。
- **RLS を CSRF 対策の代替にしない。** RLS（admin role 検証）は最終防御として維持し、CSRF はその手前のアプリ層で弾く。
- **`writeAuditLog` の記録フローは維持する。** 検証で弾かれた操作はログに残らない（正しい挙動）。
- **一般ユーザーの状態変更操作（コメント投稿・通報送信）も同じ攻撃面を持つ**が、本 REQ の主対象は admin 操作。含めるか別 REQ にするかは設計時に判断する。
- **緊急度 Medium / 重要度 High**。SameSite が現に効いており古典的 CSRF が成立しない可能性がある一方、成功時の被害（admin 権限付与・投稿削除）が大きいため Defense in Depth として必須級。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-150-csrf-token-protection/01-background-and-problems.md) | 背景と現状の問題（middleware の Cookie 設定コード、クライアント直叩き7箇所のファイルパス:行番号、既存の緩和要因） |
| [02-goals-and-requirements.md](REQ-150-csrf-token-protection/02-goals-and-requirements.md) | 目的3点と、機能要件 FR-150-01〜05（トークン発行・対象操作の検証・格納方式の確認・SameSite 維持・自動付与）、非機能要件 NFR-150-01〜03 |
| [03-acceptance-impact-and-priority.md](REQ-150-csrf-token-protection/03-acceptance-impact-and-priority.md) | 受入条件 AC-150-01〜05（Given/When/Then）、影響範囲（変更対象ファイル表・他機能への影響）、優先度と理由 |
