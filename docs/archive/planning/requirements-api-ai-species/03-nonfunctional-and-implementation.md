## 非機能要件

| 項目 | 要件 |
|-----|------|
| コスト | `claude-3-5-haiku`: 約 $0.0004/回。月 1000 投稿で約 $0.4 |
| セキュリティ | `ANTHROPIC_API_KEY` はクライアントに非公開。Edge Function のみ保持。JWT 検証必須 |
| プロンプトインジェクション | JSON スキーマバリデーションで想定外レスポンスを排除 |
| コスト上限 | Anthropic コンソールで月次上限アラート設定（$5 推奨） |

---

## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `supabase/functions/classify-species/index.ts` | Claude API 呼び出し Edge Function |
| `src/hooks/useSpeciesClassifier.ts` | Edge Function 呼び出しフック |
| `supabase/migrations/20260316000001_add_ai_columns.sql` | ai_species, ai_confidence カラム追加 |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/components/features/posts/PostForm.jsx` | `useSpeciesClassifier` 組み込み + AI バナー UI |
| `src/types/index.ts` | `ClassificationResult`, `UseSpeciesClassifierResult` 型追加 |
| `src/locales/*/translation.json` | `aiClassify.*` キー追加 |

### DB 追加（任意）

```sql
-- ai_species（判定結果保存）, ai_confidence（管理者が低信頼度投稿を確認可能）
ALTER TABLE posts
  ADD COLUMN ai_species TEXT CHECK (ai_species IN ('american','bullfrog','unknown')),
  ADD COLUMN ai_confidence FLOAT CHECK (ai_confidence BETWEEN 0 AND 1);
```

---
