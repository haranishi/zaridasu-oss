## 未確定事項（実装着手前に決める）

| # | 論点 | 選択肢 | 決定 |
|---|---|---|---|
| 1 | `escapeHtml` の置き場所 | A. `_shared/mailer.ts` から直接 import / B. `_shared/html.ts` へ切り出して mailer から re-export | 未定 |
| 2 | `analyze-image:231` のラベル | A. `_shared/labels.ts` に統合 / B. AIプロンプト専用表現として分離を維持（理由をコメントに明記） | 未定 |
| 3 | 集約監視の実装手段 | A. Sentry Deno SDK / B. Resend による管理者メール（`notify-gemini-key-failure` と同型） | 未定 |
| 4 | フロント/Edge の supabase-js バージョン差の検知 | A. チェックを追加 / B. 月次更新 workflow に委ねる | 未定 |
| 5 | `eval:ai` の実行方式 | A. `workflow_dispatch` の手動運用 / B. モデル・プロンプト変更PRで自動実行（パス条件付き） | 未定 |
| 6 | バッチの並列数 | A. 5 / B. 10 / C. 環境変数で可変 | 未定 |

## 要確認

- **Resend / Web Push のレート制限**: FR-309-04 の並列化（5〜10並列）が Resend の送信レート制限や Web Push サービス（FCM / APNs 経由）のレート制限に触れないかは**未検証**である。実装前に Resend のプラン上のレート制限を確認し、必要なら並列数を落とすか送信間隔を入れる。
- **Sentry Deno SDK の Edge Function 対応**: FR-309-03 の選択肢Aについて、Supabase Edge Runtime（Deno Deploy 系）で Sentry Deno SDK が動作するか、バンドルサイズとコールドスタートへの影響がどの程度かは**未検証**である。動作しない・重い場合は選択肢B（Resend 通知）に倒す。
- **バッチのデッドライン値**: Supabase Edge Function の実行時間上限（プラン依存）を確認したうえで、それより短い値を設定する。上限値そのものは本要件では断定していない。
- **`analyze-image` の redact 追加による退行**: FR-309-06 は「現時点でAPIキーが漏れる経路は無いことを検証済み」という前提の上での予防的修正である。redact により**デバッグ時に必要な情報まで落ちる**可能性があるため、`analyze-audio:848` / `health-gemini:118` と同じ粒度に揃えることを条件とする。
- **`deno.land/std@0.168.0` の更新影響**: 2022年系のため、新しい std では `testing/asserts.ts` のパスや API が変更されている。更新する場合は `_shared/__tests__/` の import 修正が必要になる見込みだが、影響範囲は未計測。
