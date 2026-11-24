## リスク・トレードオフ

| リスク | 緩和策 |
|---|---|
| 一斉送信でスパム判定 / レート制限 | Resend のサンドボックス検証 + DKIM/SPF 設定確認 + 送信間隔調整 |
| 通知過剰でユーザー離脱 | ダイジェスト化 + opt-out 容易化 + 1 日 5 通キャップ |
| 市区町村未設定ユーザーへの届け不能 | プロフィール設定画面で市区町村を必須項目化（別要件） |
| pg_net Webhook の失敗で通知欠落 | 失敗 audit_logs を監視するアラート（管理画面ダッシュボード）|
| unsubscribe トークン漏洩 | JWT 短期 TTL + ワンクリック後即無効化 |
| 個人情報を含むメール送信のコンプライアンス | 位置情報は市区町村粒度、display_name のみ含める方針を明文化 |
| ダイジェスト送信の二重実行 | scheduled function に `pg_advisory_lock` をかけ単一実行を担保 |

---

## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | user_profiles カラム追加 + opt-out UI | なし | S | TODO |
| P0 | Edge Function 雛形 + Resend 接続検証 | RESEND_API_KEY 確保 | M | TODO |
| P0 | 新規依頼通知トリガー + pg_net Webhook | Edge Function | M | TODO |
| P1 | 結果投稿通知（status 遷移トリガー連動） | REQ-086 完了 | S | TODO |
| P1 | クローズ通知 | 上記 | S | TODO |
| P2 | 応答ダイジェスト（scheduled function） | REQ-087 完了 | M | TODO |
| P2 | unsubscribe エンドポイント + JWT 検証 | 上記 | S | TODO |
| P3 | 単体テスト + メール配信 e2e（Resend sandbox） | 全部 | M | TODO |

合計工数: **L（2〜3 日）**

---

## サマリー

メール通知（Resend 経由 + Edge Function + pg_net Webhook）で、依頼ループに「外からの呼び込み」を追加する。即時通知（新規依頼 / 結果投稿 / クローズ）とダイジェスト通知（応答）を使い分け、opt-out / unsubscribe で通知疲れを防ぐ。実装パターンは REQ-073 と同等で、既存基盤の流用が効く。

### 次のアクション
1. RESEND_API_KEY と送信元アドレス DNS の準備状況確認
2. user_profiles カラム追加マイグレーションを先行投入
3. Edge Function 雛形を作成し、新規依頼通知から段階的にロールアウト
4. Phase 5（REQ-089 コメント直結化）後にコメント通知も同基盤で対応
