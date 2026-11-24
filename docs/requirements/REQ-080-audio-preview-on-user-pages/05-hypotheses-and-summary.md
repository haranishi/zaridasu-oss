## 仮説検証リスト（「音声プレビューできない」の原因特定）

本要件実装前に以下を検証して、H1/H2 以外の原因が隠れていないか確認する:

| # | 仮説 | 確認手順 | 結果 |
|---|---|---|---|
| H1 | UI そのものが無い（マイページ） | MyPostsSection.tsx に `<audio>` / AudioPlayer 呼び出しがあるか | ✅ 無い |
| H2 | UI が無い（投稿詳細） | `/post/[id]` の DetailPage に audio_url 表示があるか | ✅ 無い |
| H3 | `posts.audio_url` が NULL | SQL editor で `SELECT audio_url FROM posts WHERE id = '<当該投稿 ID>'` | **要ユーザー確認** |
| H4 | iOS Safari preload 非互換 | 実機で試す or UA 判定でログ出力 | **要検証** |
| H5 | Storage CORS で弾かれる | DevTools Network タブで `audio/*` リクエストの status / headers 確認 | **要検証** |
| H6 | Storage ファイルが消えている | `audio_url` を直接ブラウザで開いて 200 か 404 か確認 | **要ユーザー確認** |

---

## サマリー

「音声のプレビューができない」の最有力原因は **マイページ / 投稿詳細に音声再生 UI そのものが実装されていない** こと。管理画面にしか AudioPlayer が置かれていないため、一般ユーザーが自分の投稿を聴く手段がない。

本要件は **UI 追加 2 箇所 + エラー救済** の 3 タスクで構成され、工数は 1〜2 時間程度の XS 案件。既存 `AudioPlayer` コンポーネントを流用するため、新規コンポーネント開発は不要。

### 次のアクション
1. 本要件のレビュー（特に AC-080-05 の iOS Safari 対応レベル）
2. 実装着手（`/implement REQ-080` コマンド想定）
3. 実装後にマイページ/詳細ページで動作確認、`/test-app` で回帰確認
