## 非機能要件

### コスト削減目標
- **入力トークンの 75% 割引**（cache hit 時）
- 想定 cache hit 率: **90% 以上**（TTL 内に投稿が継続的にある前提）
- 総合: 入力トークンに対し実効 **-67%** 程度のコスト削減

### キャッシュ料金
- Gemini Cached Content の保存料金は小額。月額数 USD 以内に収まること（要確認）

### レイテンシ
- Cache 利用により **+0 〜 -100ms**（短縮されることが多い）

### 可用性
- Cache miss / API エラー時も判定処理が完了すること（フェイルオープン）
- TTL 切れによる **判定停止が起こらないこと**（自動 refresh）

### 互換性
- `analyze-audio` と `analyze-image` で別々の cache ID を持つ（プロンプトが異なるため）
- モデル切替時（REQ-076）には cache を再作成

---

## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `supabase/functions/analyze-audio/index.ts:83-145` | プロンプトを cached part / dynamic part に分離、cache ID 利用 |
| `supabase/functions/analyze-image/index.ts:117-` | 同上 |
| `supabase/functions/_shared/aiCache.ts`（新規） | cache 作成 / 取得 / refresh の共通ロジック |

### 環境変数追加
| 変数名 | デフォルト | 説明 |
|---|---|---|
| `GEMINI_CACHE_TTL_SECONDS` | `3600` | Cached Content の TTL |
| `GEMINI_CACHE_REFRESH_MARGIN_SECONDS` | `300` | TTL 切れ前の自動 refresh タイミング |
| `GEMINI_CACHE_ENABLED` | `false` | フィーチャーフラグ |

### DB スキーマ変更
- 新規テーブル `ai_cache_registry`

---
