## 6. 受入条件

- [ ] **AC-01**: `supabase/functions/` の非テストソースに `SUPABASE_SERVICE_ROLE_KEY` の直接参照が 0 件（共有ヘルパー内の後方互換フォールバックを除く。FR-287-05 完了後は 0 件）
- [ ] **AC-02**: 本番 `vault.secrets` の `edge_function_service_role_key` が新方式キーで、pg_net 経由の呼び出しが 200 を返す
- [ ] **AC-03**: Management API のキー一覧で、レガシー `service_role` が無効化されている
- [ ] **AC-04**: レガシー無効化後 24 時間、Edge Function のエラーログと `net._http_response` の 4xx/5xx が 0 件
- [ ] **AC-05**: 作業期間中にユーザーのセッションが切れていない（レガシー `anon` は有効のまま）
- [ ] **AC-06**: 本番のトリガー定義・関数定義を走査して、JWT らしき文字列が 0 件
- [ ] **AC-07**: publishable 移行の方針が runbook に記載されている

---

## 7. 未確定事項（実装着手前に決める）

| # | 論点 | 選択肢 | 決定 |
|---|---|---|---|
| 1 | 実施タイミング | A. REQ-285 のデプロイと同時（再デプロイ 1 回で済む） / B. REQ-285 完了後に単独で | 未定 |
| 2 | Vault のキー名 | A. `edge_function_service_role_key` のまま値だけ差し替え / B. `edge_function_secret_key` へ改名（migration 追加が必要） | 未定 |
| 3 | レガシー `service_role` を無効化するか、有効のまま放置するか | A. 無効化する（本要件の目的） / B. 参照だけ移して無効化は保留 | 未定 |
| 4 | publishable 移行を本要件に含めるか | A. 別要件（現案） / B. まとめて実施 | 未定 |
| 5 | `webhook_secret` の Vault 登録と fail-closed 有効化を同時に行うか | A. 別途 / B. 同時（Edge の再デプロイが 1 回で済む） | 未定 |

---
