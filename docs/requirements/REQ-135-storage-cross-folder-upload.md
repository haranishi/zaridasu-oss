# REQ-135: Storage INSERT が他人フォルダ・anon フォルダへの書き込みを許可している脆弱性の修正

## これは何か

`post-photos` / `post-audio` の Storage INSERT policy に**フォルダ所有者チェックが無い**という
脆弱性の修正要件。緊急度 High / 重要度 High。

## 目的・背景（要約）

フロントは常に `${auth.uid()}/${filename}` 形式でキーを生成しているが、`storage.objects` の
INSERT policy（`authenticated_upload` / `authenticated_upload_audio`）は **`bucket_id` と拡張子しか
見ていない**。そのためクライアントがキー名を直接指定すれば、`<victim-uuid>/foo.jpg` や
`anon/foo.jpg` のように**他人フォルダへ書き込める**。

DELETE 側は `name LIKE auth.uid() || '/%'` で守られており、これが**攻撃者にとって好都合**になっている
（書き込み放題なのに被害者以外は消せない）。バケットは public read のため、被害者 UUID 配下に
違法コンテンツを置いて外部公開 URL を作られる最悪シナリオもある。

## 主要な決定事項（要点）

- INSERT policy に **`(storage.foldername(name))[1] = auth.uid()::text`** を追加し、DELETE policy と
  **対称の防御線**にする。片肺状態を解消するのが本要件の核。
- 拡張子チェックは正規表現から **`lower(storage.extension(name)) IN (...)`** へ強化（誤検知が少ない）。
  副作用として `A-uuid/test.WEBP` のような大文字拡張子も通るようになる。
- **フォルダなしのキー（`test.webp`）も拒否**される（`foldername(name)[1]` が NULL で一致しないため）。
- 修正は **migration 1本 + `schema.sql` 数行**で完結する。`DROP POLICY IF EXISTS` で冪等。
  正規アップロード経路の挙動は変わらない（後方互換）。
- 適用**前**に既存オブジェクトを監査するクエリを流し、他人フォルダ書き込みの実績を検出する。
  検出物の削除・通報は運用判断で、**本要件は検出までがスコープ**。
- Edge Function は service_role で RLS bypass のため影響なし。
- REQ-079 / REQ-129 の hash dedup は本要件が守られないと前提が破綻する（**hash collision 攻撃**の
  成立条件が消えるという副次的恩恵がある）。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-135-storage-cross-folder-upload/01-background-and-problems.md) | 背景と現状の問題（該当 policy の実定義・DELETE との対比・攻撃シナリオ・関連 REQ） |
| [02-goals-and-functional-requirements.md](REQ-135-storage-cross-folder-upload/02-goals-and-functional-requirements.md) | 目的と機能要件 FR-135-01〜04（新規 migration の SQL・schema.sql 同期・既存オブジェクト監査・フロント整合確認） |
| [03-non-functional-and-tests.md](REQ-135-storage-cross-folder-upload/03-non-functional-and-tests.md) | 非機能要件 NFR-135-01〜03 とテスト要件 FR-135-05〜06（pg-tap シナリオ 7 種・E2E 回帰） |
| [04-acceptance-impact-priority.md](REQ-135-storage-cross-folder-upload/04-acceptance-impact-priority.md) | 受入条件 AC-135-01〜07、影響範囲（変更ファイル・他機能への影響）、優先度と理由 |
