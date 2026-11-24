# REQ-212: 公開エンドポイントの bot 対策・エッジレート制限・CAPTCHA（多層化）

これは何か: 公開入力経路と認証フォームに、エッジ層のレート制限と CAPTCHA を追加して多層防御にする要件定義。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

現状のレート制限は **DB トリガー中心**で、投稿・調査依頼・管理者ログインしかカバーしていない。**通報・コメント・いいねには一切のレート制限が無く**、一般の認証フォーム（signin/signup/reset）にも CAPTCHA が無い。さらに全公開トラフィックは Vercel オリジンと Supabase に**到達してから** DB トリガーで弾かれるため、bot の大量リクエストは弾かれる前に Function 実行・Supabase 接続・Egress を消費する。LLM を呼ぶ AI 再分析もフロントから直接 invoke でき、コスト直結の経路になっている。

## 主要な決定事項（要点）

- **多層化であって重複ではない**。既存の DB トリガー / `admin_login_*` は**最終防衛線として維持**し、その手前に「エッジで間引く層」と「人間性を確認する CAPTCHA」を足す。前段で大量を間引き、後段で正確に上限を強制する役割分担にする。
- **一人運用の卒研 PF としての手段選択**: 大掛かりな WAF ではなく (a) Vercel Firewall の無料枠ルール、(b) Supabase Auth 組み込み CAPTCHA（hCaptcha / Turnstile）、(c) `@upstash/ratelimit` + Upstash 無料枠を優先する。
- **通報スパムによる検閲攻撃が最大の実害**。`flag_post_on_reports` は3件で `is_flagged` を立てるため、通報連打で任意投稿を不正フラグできる。「同一 IP / 同一 post への連打で is_flagged を立てられない」状態を必須とする。
- **IP 抽出は `extract_request_ip` と同じ優先順**（`cf-connecting-ip` → `x-forwarded-for` 末尾 → `x-real-ip`）に揃える。
- **fail-open / fail-closed は経路別に決める**。書き込みは fail-closed、閲覧は fail-open。閲覧系を 429 で巻き込まない。
- **ブルートフォースは IP 単位だけでなく email（アカウント）単位でも計数**し、指数バックオフを掛ける（分散 IP からの単一アカウント狙いを検知）。email enumeration を誘発しない汎用エラーメッセージは維持。
- **AI 再分析は post_id 単位に加えて caller(user_id)/IP 単位の日次上限**を足す。fail-closed は維持。
- **【訂正 2026-07-30 / REQ-292 問題B】**「管理者ログインには保護がある」という前提は誤りで、実態は**管理者・一般とも実効的な保護が無かった**。ただし FR-212-04（認証フォームへの Turnstile）の主張は有効で、Turnstile が効くのは `options.captchaToken` を渡す Auth SDK 呼び出しのみ。**この境界を受容根拠に流用しないこと**。
- CAPTCHA 導入時は `next.config.ts` の CSP（`script-src` / `frame-src` / `connect-src`）に許可ドメインを最小追記する。
- 緊急度 Medium〜High / 重要度 High。

## 分割ファイル

- [01-background-and-problems.md](REQ-212-public-endpoint-bot-rate-limit/01-background-and-problems.md) — 背景（既存レート制限の範囲、参照した Obsidian ノート、多層化と一人運用の方針）＋ 現状の問題4点（通報/コメント/いいねの無制限、認証の CAPTCHA 欠如と訂正注記、エッジ層の不在、AI 再分析の caller 単位上限欠如）
- [02-goals-and-requirements.md](REQ-212-public-endpoint-bot-rate-limit/02-goals-and-requirements.md) — 目的4点 ＋ 機能要件 FR-212-01〜07（エッジ基盤、通報/コメント/いいねの制限、CAPTCHA、アカウント単位バックオフ、AI スロットル、入力サイズ・同時実行上限）＋ 非機能要件 NFR-212-01〜05
- [03-acceptance-impact-and-priority.md](REQ-212-public-endpoint-bot-rate-limit/03-acceptance-impact-and-priority.md) — 受入条件 AC-01〜08 ＋ 影響範囲（変更対象・他機能への影響）＋ 優先度と理由
