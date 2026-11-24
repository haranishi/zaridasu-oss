# REQ-133: reports INSERT ポリシー重複バグの解消（無検証 INSERT 経路の閉塞）

## これは何か

本番 `reports` テーブルに INSERT ポリシーが2本共存しており、**無検証の `WITH CHECK (true)` がバリデーション付きポリシーを事実上無効化している**問題の要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

PostgreSQL の PERMISSIVE ポリシーは同一コマンドで複数定義されると **OR 結合**される。本番には `public_insert_reports`（`WITH CHECK (true)`）と `validated_insert_reports`（`post_id IS NOT NULL AND reason <> ''`）が共存しているため、前者がある限り後者の制約は素通りし、anon ロールでも無検証で INSERT できる。

実害は `flag_post_on_reports` トリガー経由で生じる。未解決通報が3件集まると `posts.is_flagged=TRUE` が立つため、**anon が任意の投稿を no-show 化できる**。加えて `comment` に長さ上限がなく、数MBの TEXT を投げられる。

repo 側には `public_insert_reports` しか定義がなく、`validated_insert_reports` を作る migration は存在しない。つまり本番にだけ手動追加された schema drift であり、これを migration で管理下に取り込む必要がある。

## 主要な決定事項の要点

- **INSERT 経路を 1 本のバリデーション付きポリシーに統一する。** 両方を DROP してから `validated_insert_reports` を1本だけ再作成する（OR 結合を成立させない）。
- **二重防御を敷く。** ポリシーの `WITH CHECK` に加え、テーブル側にも `reports_comment_length`（500文字）の CHECK 制約を置き、DB 直叩きにも効かせる。`reason` の enum 一致も両方で明示する。
- **既存データを先に整える。** migration 冒頭で 500 文字超の `comment` を `left(comment, 500)` で truncate する（idempotent）。
- **重複そのものを invariant としてテストする。** pg-tap で `tablename='reports' AND cmd='INSERT'` の行数が**ちょうど 1**であることを assert し、再発を CI で止める。
- **後方互換は確保済み。** 正規クライアント（`UnifiedReportButton` 等）は `post_id`/`reason` を必ず送り、UI 側で既に 500 文字制限があるため挙動は変わらない。`flag_post_on_reports` トリガーも変更しない。
- **REQ-020 / REQ-025 / REQ-034 とは独立**して進められる新規領域。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-133-reports-insert-policy-duplicate/01-background-and-problems.md) | 背景（OR 結合の仕様と drift の経緯）と現状の問題（コード上の定義・テーブル定義・攻撃シナリオ・他REQとの関係） |
| [02-goals-and-functional-requirements.md](REQ-133-reports-insert-policy-duplicate/02-goals-and-functional-requirements.md) | 目的3点と機能要件 FR-133-01〜03（migration 全文・schema.sql 同期・既存データの整合性確認） |
| [03-nfr-and-test-requirements.md](REQ-133-reports-insert-policy-duplicate/03-nfr-and-test-requirements.md) | 非機能要件 NFR-133-01/02（冪等性・後方互換）とテスト要件 FR-133-04/05（pg-tap 5ケース・CI統合） |
| [04-acceptance-impact-and-priority.md](REQ-133-reports-insert-policy-duplicate/04-acceptance-impact-and-priority.md) | 受入条件 AC-133-01〜06、影響範囲（変更対象ファイル・他機能への影響）、優先度（Critical）と理由 |
