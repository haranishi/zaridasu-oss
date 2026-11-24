## 1. 背景

### 1.1 何が露出していたか

旧トリガーは Supabase ダッシュボードの Database Webhooks 機能で作成されたもので、`supabase_functions.http_request()` を直接呼び、その引数に `Authorization: Bearer <service_role JWT>` をリテラルで持っていた。ダッシュボードの Webhook 機能は仕様上こうなる。

同じ役割の新経路（`private.trigger_analyze_image()` → `private.call_ai_edge_function()`）は Vault からキーを読むため、定義に秘密値が現れない。両方が有効だったため 1 投稿につき Edge Function が二重に呼ばれていた（重複分は重複排除層が吸収し Gemini のトークン消費は 0）。

削除は `supabase/migrations/20260728000001_drop_legacy_analyze_image_webhook.sql` で実施済み。**2026-07-29 時点の本番 `posts` に残る解析トリガーは `analyze_image_on_insert` と `analyze_audio_on_insert_or_update` の 2 本のみ**であることを実測で確認した（いずれもリポジトリ管理下）。

### 1.2 なぜ緊急ではないか

| 観点 | 実測 |
|---|---|
| リポジトリ作業ツリー | 該当値なし |
| git 履歴 | 該当値なし |
| GitHub リポジトリ公開範囲 | private（`haranishi/zaridasu`） |
| PostgREST 経由での到達性 | 不可（`pg_catalog` は公開されない） |
| 読み取り可能だった主体 | DB 管理者レベルのアクセスを持つ者のみ |
| 現在の DB 内の残存 | なし（トリガー削除により消滅） |

### 1.3 なぜそれでもやるか

- 有効期限 2036 年の長寿命キーが、一度でも定義文に現れた事実は残る
- レガシー JWT 方式のキーは失効・スコープ制御ができない。新方式キーは無効化・再発行が独立して行える
- 同じ轍を踏まないための「トリガー定義に秘密値を書かない」というルールを、実装を伴って確立したい

---
