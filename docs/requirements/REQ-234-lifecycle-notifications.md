# REQ-234: 研究採用通知＋Resend ライフサイクルメール（リテンション）

## これは何か

ザリダスのメールが「相手のアクションに反応する取引通知」だけで、ユーザーを能動的に呼び戻す
**ライフサイクルメールが 1 本も無い**状態を解消する要件。(A) 研究採用通知、(B) 休眠復帰、
(C) 週次ダイジェストの 3 種と、その購読管理・配信停止・ガードレールを導入する。

## 主要な決定事項の要点

- **北極星は Retention**。成功指標は「送信数」ではなく **復帰率（休眠→再活動）・継続率**に置く
  （虚栄の指標で評価しない）。配信停止率・苦情率をガードレールとして監視する。
- **研究採用通知が最強のフック**。卒研 PF だけが返せる「研究貢献の実感」で、内発的動機を刺激する。
  ただし **採用判断が不透明だと不信を招く**ため、基準を明確にし `audit_logs` で追跡可能にする。
- **`is_official` とは意味を分ける**。`is_official` はマップ公開用のフラグであり、研究採用は
  専用の列/テーブルで表す。更新は管理者/サービスロール限定＋保護トリガー＋監査記録。
- **CTA は 1 メッセージ 1 ゴール／価値提示型**。「観察を続けて」という押し付けではなく
  「近所で新しい観察があった」「あなたの観察が採用された」→ 自然な次の一歩、の形にする。
- **List-Unsubscribe（ワンクリック配信停止）を共通 mailer で一元付与**する。配信停止トークンは
  `auth.users.id` を直載せせず**署名付き**にする（列挙・推測耐性、REQ-211 と整合）。
- **メール本文に緯度経度の生値・PII を載せない**。地域情報は**市区町村粒度の集計まで**。
- **定期実行の土台（pg_cron + pg_net）は本 REQ で新設**する。現状リポジトリに定義は 0 件。
  未有効環境では **no-op で安全に失敗**させ、有効化は runbook で管理する。
- **fail-soft と冪等性を維持**。個別失敗は続行し、二重発火でも多重送信しない「送信済み記録」を持つ。
- **段階導入**：研究採用通知＋購読管理＋List-Unsubscribe＋ガードレール（最も効く＋安全弁）を先行し、
  pg_cron 依存の休眠復帰・週次ダイジェストを後続にする。
- **境界**：到達性（SPF/DKIM/DMARC）は REQ-219、PII は REQ-211、Web Push は REQ-237、
  指標の可視化は REQ-233 / REQ-232 の管轄。既存の取引通知 4 関数は変更しない。
- **未決**：宛先言語の解決方法（`user_profiles` に `locale` 列を足すか、当面 ja 固定か）は
  選択と理由を記録して決める（FR-234-09）。

## 目次（各部品）

- [01-background-and-source-notes.md](REQ-234-lifecycle-notifications/01-background-and-source-notes.md)
  — 背景：現状のメールが取引通知 4 本のみである事実、下敷きにした Obsidian 2 ノート（Retention 北極星・ヘルススコア・健全 CTA）、本 REQ のスコープ限定。
- [02-current-problems.md](REQ-234-lifecycle-notifications/02-current-problems.md)
  — 現状の問題 1〜7：ライフサイクルメール不在、定期実行の仕組み不在、last_active_at 相当の欠如、購読設定が調査依頼専用、List-Unsubscribe 不在、研究採用データが `is_official` しかない、メール本文が日本語ハードコード。
- [03-goals-and-functional-requirements.md](REQ-234-lifecycle-notifications/03-goals-and-functional-requirements.md)
  — 目的と機能要件 FR-234-01〜10（共通 mailer、購読カテゴリ列、購読 UI と配信停止ページ、研究採用イベント、研究採用通知関数、休眠復帰バッチ、週次ダイジェスト、pg_cron 土台、i18n と宛先言語、ガードレール計測）。
- [04-nfr-and-acceptance-criteria.md](REQ-234-lifecycle-notifications/04-nfr-and-acceptance-criteria.md)
  — 非機能要件 NFR-234-01〜06（fail-soft、多重送信防止、PII 最小掲載、ドリフト防止・冪等性、シークレット非露出、到達性の依存）と受入条件 AC-01〜09。
- [05-impact-boundaries-and-priority.md](REQ-234-lifecycle-notifications/05-impact-boundaries-and-priority.md)
  — 影響範囲（本 REQ が担う範囲／担わない範囲＝既存 REQ との境界／他機能への影響リスク）と優先度（緊急度・重要度・理由と段階導入の判断）。
