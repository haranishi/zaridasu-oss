# REQ-132: notify-comment の comment_content 任意指定脆弱性

## これは何か

`notify-comment` Edge Function がメール本文に埋め込む文面をクライアントの req.body からそのまま受け取っており、**認証済みの一般ユーザーが任意の文面で投稿者へ通知メールを送れる**問題の要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

JWT 検証は実装済みだが、`comment_content` が `comments` テーブルへ実際に insert された行と一致するか検証されていない。`escapeHtml` で HTML タグは無害化されるものの、フィッシング文言・偽 URL・恐喝メッセージは素通しになる。zaridasu はサインアップ自由（`enable_signup = true`）なので攻撃者は容易にアカウントを取得でき、公開された投稿一覧から被害者をピンポイントで選べる。REQ-131 が「未認証外部からの攻撃」を扱うのに対し、本 REQ の脅威モデルは「**認証済の悪意あるユーザー**」である。

目的は 3 つ。(1) メール本文は `comments` に実在する行の内容のみを使い任意文面送信を不可能にする、(2) 同一コメントに対する通知の冪等性を担保する、(3) レート制限で大量送信を抑止する。

## 主要な決定事項の要点

- **入力契約を `comment_id` のみに変更**し、`comment_content` / `post_id` は受け取らない。`post_id` は `comment.post_id` を信用する。
- **深層防御として `callerUser.id` と `comment.user_id` の一致を要求**（不一致は 403）。他人のコメントを使った通知トリガーを封じる。
- **存在しない `comment_id` には 404 ではなく 200 `{ skipped: 'not_found' }`** を返す。存在確認攻撃に使わせないため、エラー応答から理由を区別できないようにする。
- **冪等性は `comment_notification_log`（`comment_id` を PK、RLS deny all）への insert 先行**で担保し、一意制約違反（`23505`）なら `already_sent` で打ち切る。
- **レート制限は2層**。ユーザーあたり 10 通知/分は 429、同一投稿者宛は 5 分で 3 通までとし、超過時は攻撃者へのフィードバックを最小化するため skip ログを残して 200 で返す。
- **Phase 分けを推奨**。Phase 1（P0・即時）は FR-132-01〜04 と FR-132-09 で、**これだけで任意文面送信が不可能になる**。以降 冪等性 → レート制限 → テスト整備の順。
- **REQ-131 とは独立**。`notify-comment` は webhook ではなく client invoke なので `WEBHOOK_SECRET` の対象外で、webhook 認証の修正だけでは本問題は解決しない。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-132-notify-comment-content-injection/01-background-and-problems.md) | 背景と現状の問題1〜5（req.body 直受領の該当行、攻撃シナリオの実コード、レート制限・冪等性の欠如、被害ターゲット、関連実装） |
| [02-goals-payload-and-idempotency.md](REQ-132-notify-comment-content-injection/02-goals-payload-and-idempotency.md) | 目的と、機能要件 A（FR-132-01〜04: payload を `comment_id` のみに）・B（FR-132-05〜06: 冪等性ログのスキーマ） |
| [03-ratelimit-client-and-tests.md](REQ-132-notify-comment-content-injection/03-ratelimit-client-and-tests.md) | 機能要件 C（FR-132-07〜08: レート制限）・D（FR-132-09: `CommentSection` の修正）・E（FR-132-10〜11: テスト） |
| [04-non-functional-requirements.md](REQ-132-notify-comment-content-injection/04-non-functional-requirements.md) | NFR-132-01〜04（セキュリティ・パフォーマンス・後方互換の移行期間・可観測性） |
| [05-acceptance-and-impact.md](REQ-132-notify-comment-content-injection/05-acceptance-and-impact.md) | 受入条件 AC-132-01〜08（Given/When/Then）と、影響範囲（変更対象ファイル表・他機能への影響） |
| [06-priority.md](REQ-132-notify-comment-content-injection/06-priority.md) | 優先度（緊急度・重要度とも High）と理由、Phase 1〜4 の分割 |
