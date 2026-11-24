# REQ-287: Supabase API キーの新方式移行と service_role キーのローテーション

作成日: 2026-07-29
状態: **一部実装済み（2026-07-29）**

優先度: **P2**（衛生目的。公開漏洩ではないため緊急ではない） ／ 深刻度: **Low-Medium** ／ 種別: セキュリティ・インフラ
関連: REQ-017（secret rotation）, REQ-221（Supabase 本番ハードニング）, REQ-240（Edge webhook fail-closed）, REQ-270（webhook secret headers）, REQ-285（Edge Function デプロイ整合性）, REQ-286（リポジトリと本番の乖離）
runbook: `docs/runbooks/secret-rotation-and-history-purge.md` / `docs/runbooks/supabase-hardening-checklist.md` / `docs/runbooks/edge-function-deploy.md`

> [!done] 実施済み（2026-07-29）
> - **FR-287-01**: `_shared/supabaseAdmin.ts` を新設し、14 本の service-role クライアント生成を集約。`SUPABASE_SECRET_KEY` を優先し未設定ならレガシーへフォールバックする。`_shared/mailer.ts` は再エクスポートへ変更。本番 12 本を再デプロイし疎通確認済み。
> - **FR-287-07**: `supabase/migrations/README.md` の運用ルールに「ダッシュボードの Database Webhooks を使わない」を理由付きで明文化。
> - テストの不変条件を反転（直接参照しないこと＋共有ヘルパー経由であること）。旧テストは対象 6 関数がハードコードで、後から追加された 8 本を検査していなかったため**自動導出**へ変更。Edge Function テスト 258 passed。
>
> **未実施（本人判断により保留）**: FR-287-02〜05（Function Secrets 登録・Vault 差し替え・疎通確認・レガシーキー無効化）。**現時点ではレガシー `service_role` キーが有効なまま**であり、コード上はフォールバックで動作している。

---

## これは何か

旧 Database Webhook トリガーの定義に service_role の JWT がリテラルで埋め込まれていた件を受けた、**Supabase 新方式キー（`sb_secret_`）への移行とレガシーキー無効化**の要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

2026-07-28、リポジトリ管理外の旧トリガー `analyze-image-on-insert` に**現行 service_role キーそのもの**（有効期限 2036 年相当）が埋め込まれていることが判明した。トリガーは同日削除済みで DB からキーは消えており、リポジトリ・git 履歴のどちらにも無く、リポジトリは private、PostgREST は `pg_catalog` を公開しないため**公開漏洩ではない**。緊急ローテーションは不要だが衛生上は差し替える。新方式キーは 2026-03-04 に発行済みで、移行は「参照の切り替えとレガシーの無効化」だけで足りる。

## 主要な決定事項の要点

- **方式 B（新方式キーへ移行）を採用。** 方式 A（JWT シークレット再生成）は `anon` も同時に変わり全ユーザーがログアウトし、再デプロイまでサイトが壊れる窓ができるため採らない。
- **本要件は service_role 側（`sb_secret_`）が主眼**で、publishable（`anon`）側の切り替えは方針記録のみ（FR-287-06）・実施は別要件。
- **14 本の直接参照を共有ヘルパー 1 箇所に集約**し、`SUPABASE_SECRET_KEY` 優先＋レガシーへフォールバック。フォールバックは FR-287-05 完了後に削除する。
- **レガシー無効化の前に全経路の疎通確認**（FR-287-04）を必須にし、無効化後 24 時間のエラー監視まで含める。
- **Vault に `webhook_secret` は未登録**（§2-C）。この状態で REQ-240 の fail-closed を有効化すると既存の呼び出しが全て弾かれるため、有効化時は Vault と Edge env を揃える。
- **FR-287-07（秘密値混入の検知）だけは P1**。移行を待たずに実施でき、再発を直接防ぐため費用対効果が最も高い。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-summary.md](REQ-287-supabase-key-migration-and-rotation/01-summary.md) | §0 要件サマリー。露出の事実関係と、公開漏洩でない根拠、スコープ判断 |
| [02-background.md](REQ-287-supabase-key-migration-and-rotation/02-background.md) | §1 背景。何が露出していたか／なぜ緊急でないか（実測表）／なぜそれでもやるか |
| [03-current-state.md](REQ-287-supabase-key-migration-and-rotation/03-current-state.md) | §2 現状 A〜D。新方式キーの発行状況、参照 14 本の一覧、Vault 登録、方式 A/B 比較 |
| [04-goals-and-scope.md](REQ-287-supabase-key-migration-and-rotation/04-goals-and-scope.md) | §3 目的（4点）と §4 スコープ外 |
| [05-requirements.md](REQ-287-supabase-key-migration-and-rotation/05-requirements.md) | §5.1 機能要件 FR-287-01〜07（集約・env・Vault・疎通・無効化・publishable 方針・混入検知）と §5.2 非機能要件 |
| [06-acceptance-and-open-questions.md](REQ-287-supabase-key-migration-and-rotation/06-acceptance-and-open-questions.md) | §6 受入条件 AC-01〜07 と §7 未確定事項5件（実施タイミング・Vault 名など） |
| [07-impact.md](REQ-287-supabase-key-migration-and-rotation/07-impact.md) | §8 影響範囲（新規・変更・本番環境への操作・他要件への影響） |
| [08-priority.md](REQ-287-supabase-key-migration-and-rotation/08-priority.md) | §9 優先度。緊急度 Low の理由と、要件ごとの個別優先度 |
