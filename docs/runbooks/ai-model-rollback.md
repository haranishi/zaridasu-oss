# AI 判定モデル ロールバック手順書

> 参照要件: REQ-076
> 所要時間: **5 分以内**（環境変数変更のみ）

---

## いつ使うか

- `analyze-audio` または `analyze-image` のモデル切替後に **精度低下 / API エラー急増 / 想定外の挙動**が観測されたとき
- 具体的には:
  - 切替後 24 時間の manual review 件数が **施策前比 +10% 以上**
  - 5xx / 4xx エラー率が普段の 2 倍以上
  - 自動却下（rejected）件数が突発的に急増

## 事前確認

1. 現在のモデル設定を確認
   ```bash
   supabase secrets list --project-ref <PROJECT_REF> | grep GEMINI
   ```
2. 切替履歴（本ドキュメントの末尾「切替ログ」）を確認して戻すべき値を特定

## ロールバック手順

### 音声判定 (`analyze-audio`)

1. Supabase Dashboard → Project → **Edge Functions → Secrets** を開く
2. `GEMINI_AUDIO_MODEL` を切替前の値に戻す（例: `gemini-2.5-flash`）
3. 1〜2 分待つと Edge Function が新 secret を読み込んで反映
4. `/admin/logs` または Supabase Logs で 1 リクエスト通して値が反映されているか確認

### 画像判定 (`analyze-image`)

1. 同様に `GEMINI_IMAGE_MODEL` を切替前の値に戻す
   - GA 版推奨値: `gemini-2.5-flash-lite`
   - preview（非推奨）: `gemini-3.1-flash-lite-preview`
2. 1〜2 分待機後、反映確認

### 閾値のロールバック

閾値（`AI_AUTO_APPROVE_BOTH` / `AI_AUTO_APPROVE_AUDIO_ONLY` / `AI_AUTO_REJECT_CONFIDENCE`）を env で変更していた場合は同様に削除または元値に戻す。
未設定の場合はコード内デフォルト（0.75 / 0.85 / 0.70）に戻る。

## 事後

- 本ファイル末尾の「切替ログ」に **戻した理由・影響範囲・戻した時刻**を追記
- Slack #ops に報告（チーム運用に準じる）

---

## 切替ログ

| 日時 (UTC) | function | 変更前 → 変更後 | 理由 | 実施者 |
|---|---|---|---|---|
| 2026-04-24 | analyze-image | `gemini-3.1-flash-lite-preview` → `gemini-2.5-flash-lite` | REQ-076: preview 依存解消 | (implement agent) |
| 2026-04-24 | analyze-audio | `gemini-2.5-flash` → `gemini-2.5-flash-lite` | REQ-076: コスト削減 | (implement agent) |
