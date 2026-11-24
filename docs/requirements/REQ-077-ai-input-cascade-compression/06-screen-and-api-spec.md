## 画面仕様

### SC-077-01: 投稿フォーム（既存画面の拡張）
- **URL:** `/post`（既存）
- **追加要素:**
  - 音声録音後の「⚠️ 音が小さすぎます。録音し直すか、それでも投稿しますか？」警告バナー
  - 画像アップロード後の「⚠️ ブレが激しい可能性があります」警告バナー
  - 圧縮処理中のスピナー + 進捗テキスト「AI 用に最適化中…」
- **状態追加:** `compressing`, `gateWarning`

---

## API 仕様

### API-077-01: AI バリアント Storage 参照規則
- **新規エンドポイントなし**（既存 Storage publicUrl の path 規則を拡張）
- **Edge Function 内ロジック:**
  ```
  ai_url = original_url.replace(ext, '.ai.' + ai_ext)
  fetch(ai_url) || fetch(original_url)
  ```

---

## データモデル・DB 設計
変更なし（Storage path 規則のみ拡張）。

## マイグレーション計画
不要。

---
