## 1. 初回設定（ダッシュボード・人手）

> 「予算 = ハード上限ではない」前提で、**検知を多層に重ねる**のが目的。各サービスで別々に設定する。

### 1-1. Google Cloud（Gemini を含むプロジェクト）

1. **予算アラート**（Billing → 予算とアラート → 予算を作成）
   - 対象: Gemini（Generative Language API）を有効化している**専用/本番プロジェクト**。
   - 金額: 月額の支払い許容額（卒研 PF なので低めに）。
   - しきい値ルール: **実績 50% / 80% / 100%** に加えて **予測 100%**（予測でも通知）。
   - 通知先: **本人が毎日見るメール**（`ADMIN_NOTIFY_EMAIL` と揃える）。Pub/Sub は任意。
   - メモに「**この予算はハード上限ではない。超過しても課金は止まらない**」と明記。
2. **Cost Anomaly Detection / 異常検知**（可能なら有効化）
   - 急な利用パターン変化（攻撃・暴走）を予算到達前に拾うため。無料の範囲で。
3. **クォータ**（IAM と管理 → 割り当て）
   - Generative Language API の 1 分/1 日あたりリクエストを**現実的な上限**に絞っておく（暴走時の流量を物理的に制限。事故時の段階 6 でさらに最小化）。
4. **API キー制限**（APIs & Services → 認証情報）
   - キーを「Generative Language API のみ」に制限。漏えい時の悪用範囲を狭める（REQ-126 のローテーション手順と整合）。

### 1-2. Vercel

1. **Spend Management** を有効化（Settings → Billing / Spend Management）。
   - Functions 実行・帯域・**画像最適化**（`next.config.ts` の `images`）の急増を検知できる状態にする。
   - 無料 / 低額枠に合わせて通知（可能なら上限/一時停止）を設定。
2. **Firewall / Attack Challenge**（必要時）: 入口の bot 流入は REQ-212 が主管。コスト急増が bot 起因なら段階 1（後述）で絞る。
3. `vercel.json` は `git.deploymentEnabled: false`（自動デプロイ停止済み）。API 入口を止める最終手段はデプロイ停止 / ルート停止（段階 4）。

### 1-3. Supabase

1. **使用量を週次で確認**（後述 §2 のルーチンに組み込む）: DB / Storage / **Egress** / Edge Functions Invocations。
2. **Database Webhook** の所在を把握（Database → Webhooks）: `analyze-image` / `analyze-audio` を起動している hook。段階 3 で無効化する対象。
3. **Edge Function Secrets** に kill switch / リトライ env を置く場所を確認（Settings → Edge Functions → Secrets）。`AI_ANALYSIS_ENABLED` 等はここで変更 → 即反映（再デプロイ不要）。

### 1-4. 開発 / 本番の分離（REQ-218 FR-218-07 / AC-07）

- **Gemini はプロジェクト単位で課金/レート制限が評価される。** → 本番 `GEMINI_API_KEY` を**開発 / Preview で使い回さない**。可能なら開発用に別 Google Cloud プロジェクト + 別キー。
- Supabase も開発/本番でプロジェクトを分けるのが望ましい（URL / SERVICE_ROLE_KEY / PROJECT_REF を環境別に）。
- Vercel は Production / Preview / Development で env スコープを分け、秘密値をスコープ越しに共有しない。
- CI（`.github/workflows/ci.yml` の `SUPABASE_PROJECT_REF`）は**本番 ref のみ**を参照し、テストが本番 DB に書かないことを確認する。
- **現状確認の記録**: 分離済みなら「分離済み」と追認、未分離なら分離タスクとして起票する（下のチェックボックス）。

```
[ ] Gemini: 本番キーを開発/Preview で使い回していない（別キー or 別プロジェクト）
[ ] Supabase: 開発/本番プロジェクトが分かれている（または単一であることを把握した上で受容）
[ ] Vercel: Production/Preview/Development で env スコープが分かれている
[ ] CI: SUPABASE_PROJECT_REF は本番 ref のみ・テストは本番に書かない
```

---
