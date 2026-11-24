# REQ-129: 画像 dedup が `ai_result` 全体をコピーして音声判定を混入させるバグ

これは何か: 音声なし投稿に過去投稿の音声判定が転写される本番バグの原因分析と、修正・バックフィル・再発防止の要件。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

2026-05-12、音声なし（`audio_url: null`）のアメリカザリガニ申告投稿に、同じ画像ハッシュを持つ過去のウシガエル投稿の `audio_analysis` がそのまま転写される事象が発生した。原因は `findImageDedup` が過去投稿の **`ai_result` 全体**を返していること（`findAudioDedup` は `audio_analysis` だけを返す正しい実装で、**非対称**になっていた）。`analyze-image` 側もそれを丸ごとスプレッドするため、`audio_analysis` / `combined_decision` / `model` まで転写され、さらに dedup hit で Gemini を呼ばないため `image_analysis` は空のままになる。

## 主要な決定事項（要点）

- **dedup の戻り値を画像スコープに限定**（FR-129-01）。`ai_result.image_analysis` を使い、旧形式（トップレベルに `detected_species` 等）は `pickImageFields` で画像関連フィールドのみ抽出する。
- **「画像判定済み」フィルタを追加**（FR-129-02）。`image_analysis` も top-level `detected_species` も無いレコードは dedup 候補から除外する。
- **`species` 一致を dedup の条件に追加**（FR-129-03・防御層）。同じ画像でも申告種が違えば dedup せず新規判定する。ヒット率は下がるが精度と引き換えで正解とする。
- **書き戻しは `image_analysis` フィールドのみ上書き**（FR-129-04）。既存の `audio_analysis` は保持し、`copied_from_post_id` と `dedup_status` を残す。
- **`combined_decision` は dedup hit 後も必ず再評価**（FR-129-05）。古い `waiting_for_image_analysis` を残さない。
- **汚染データはバックフィル migration でクリーンアップ**（FR-129-07）。`audio_url IS NULL` かつ `audio_analysis` を持つ行から該当キーを除去し、判定材料が空になった行は `ai_result = NULL` にして再分析対象へ戻す。
- **UI に流用の可視化を追加**（FR-129-06）。「♻️ 過去判定の流用」表示と、コピー元と申告種が違う場合の `⚠️`。
- **緊急度 Critical**（誤判定が現在進行形）。Phase 1（P0）＝コード修正＋バックフィル＋テスト、Phase 2＝UI warning、Phase 3（任意）＝pg-tap スモーク。
- 同一 post_id への `dedup_hit` ログ2回連続は**本REQのスコープ外**とし、REQ-130 候補として切り出す。

## 分割ファイル

- [01-background-and-problems.md](REQ-129-image-dedup-audio-bleed/01-background-and-problems.md) — 背景（実観測されたデータと UI 表示）＋ 現状の問題（`aiDedup.ts` の非対称実装、Edge Function の書き戻し、データ汚染、付随観察）
- [02-goals-and-dedup-fix.md](REQ-129-image-dedup-audio-bleed/02-goals-and-dedup-fix.md) — 目的3点 ＋ 機能要件A: dedup ロジックの修正 FR-129-01〜03（実装コード案つき）
- [03-write-back-and-ui.md](REQ-129-image-dedup-audio-bleed/03-write-back-and-ui.md) — 機能要件B: analyze-image の書き戻し限定 FR-129-04/05 ＋ C: UI の防御層 FR-129-06
- [04-backfill-tests-and-acceptance.md](REQ-129-image-dedup-audio-bleed/04-backfill-tests-and-acceptance.md) — バックフィル migration FR-129-07（SQL全文）＋ テスト要件 FR-129-08〜10 ＋ 受入条件 AC-129-01〜08
- [05-impact-and-priority.md](REQ-129-image-dedup-audio-bleed/05-impact-and-priority.md) — 影響範囲（変更対象ファイル表、REQ-079/125/126/127 への影響、本番デプロイ手順）と優先度・Phase 分け
