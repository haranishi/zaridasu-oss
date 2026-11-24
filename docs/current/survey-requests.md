# 調査依頼 — いまの仕様

> 「いま何が正しいか」だけを書く。「そのとき何を変えたか」は `docs/requirements/REQ-*.md`（履歴）。
> 食い違ったら**コードが正**。正本: `supabase/schema.sql`

「この場所を見てきてほしい」と依頼を出し、別の人がそこへ行って投稿で応える仕組み。**投稿（posts）が「見つけた報告」なのに対し、こちらは「探してほしい依頼」**。

## 状態

`open` → `responded` → `closed`。

**`responded` への遷移は DB トリガーが行う。** 依頼に紐づけて投稿すると（`posts.survey_request_id` を付けて INSERT）、依頼側の status が自動で変わる。アプリ側で更新しない。

緊急度は `normal` / `urgent` の 2 つ。種は `american` / `bullfrog` に加えて **`unknown`**（何がいるか分からないから見てきてほしい、という依頼があるため）。

理由（`reason`）は 1〜300 文字で、DB の CHECK でも担保している。

## 座標は投稿と同じ扱い

**生 `lat` / `lng` は anon から列 GRANT で塞いである。** 公開用は粗化した生成列 `display_lat` / `display_lng`（常に小数第 3 位＝約 111 m）。

投稿と違って `location_disclosure` による出し分けは無く、**常に粗化**する。詳細は [posts.md](./posts.md#座標の扱いここが一番壊れやすい) と同じ考え方。

## 関連するテーブル

| テーブル | 何が入るか |
| --- | --- |
| `survey_requests` | 依頼そのもの |
| `survey_request_responses` | 依頼への応答 |
| `survey_request_comments` | 依頼へのコメント |
| `survey_sites` | 定点観測サイト |

`response_count` は依頼行に持っている（毎回数え直さないため）。

## 通知

依頼が出たとき・応答がまとまったときにメールで知らせる。受け取るかは `user_profiles` の `notify_survey_request` / `notify_response_digest` で決まる（**既定は受け取る**）。

**起点になった本人には自分の応答を通知しない。** 送信は Edge Function `notify-survey-request`。詳細は [notifications.md](./notifications.md)。

## 関連

- 投稿との違い — [posts.md](./posts.md)
- 通知 — [notifications.md](./notifications.md)
- 履歴 — REQ-086（依頼と投稿の紐付け）
