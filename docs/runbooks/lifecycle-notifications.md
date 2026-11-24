# ライフサイクルメール 運用手順書（研究採用通知・休眠復帰・週次ダイジェスト）

> 参照要件: REQ-234（FR-234-01〜10 / NFR-234-01〜06 / AC-01〜09）
> 関連: REQ-219（到達性 SPF/DKIM/DMARC・**本 REQ のスコープ外＝前提**）、REQ-211（PII）、REQ-179（reporter_ip）、REQ-237（Web Push）
> 所要時間: 初回セットアップ **45 分以内** + ステージング実送信検証

---

## これは何か

既存の取引通知（承認・コメント・調査依頼）とは別に、**ライフサイクル層のメール 3 種**（研究採用通知 / 休眠復帰 / 週次ダイジェスト）を運用するための手順書。初回セットアップ、ステージングでの実送信検証、配信停止率の監視、しきい値超過時の停止判断までを扱う。

## 着手前の前提（3 つ）

1. **到達性（SPF / DKIM / DMARC）は本 REQ では扱わない。REQ-219 が主管。** 未設定のまま頻度を上げると、既存の取引通知まで巻き添えで迷惑メール判定される。本番有効化の前に REQ-219 の完了を確認する。
2. **配信頻度の誤設計はドメインレピュテーションを毀損する。** List-Unsubscribe とガードレール（配信停止率の監視）を必ずセットで運用する。
3. **秘密値はコミットしない。** `RESEND_API_KEY` / `WEBHOOK_SECRET` / service-role key は Secrets と Vault にのみ置く。`NEXT_PUBLIC_` は厳禁。

## 主要な決定事項（要点）

- **成功指標は「送信数」ではない**。復帰率と継続率（リテンションカーブの平坦化）で評価する。
- migration は pg_cron の有効化を **冪等かつ fail-soft** に試みるため、**「migration を流した＝cron が動いている」とは限らない**。`cron.job` を必ず目視確認する。
- 宛先言語は当面 **既定言語（ja）で送る**（`user_profiles` に locale 列が無いため。多言語化は後続 REQ）。
- 配信停止率が危険域（> 2%）または苦情率が危険域（> 0.3%）に達したら、当該カテゴリの cron ジョブを**即停止**する。
- 既存の取引通知 4 関数は**本 REQ で不変**。ライフサイクル層だけを足している。

## 各部品

- [01-prerequisites-and-architecture.md](./lifecycle-notifications/01-prerequisites-and-architecture.md) — 0. 重要な前提（全文）と 1. 構成（メール 3 種の起動経路・頻度の表、購読カテゴリ列、宛先言語の決定）。
- [02-initial-setup.md](./lifecycle-notifications/02-initial-setup.md) — 2. 初回セットアップ（Resend / webhook 共有秘密 / pg_net・pg_cron・Vault / Edge Function デプロイ）。cron ジョブ登録の確認 SQL を含む。
- [03-staging-verification.md](./lifecycle-notifications/03-staging-verification.md) — 3. ステージングでの実送信検証（3 種の手動起動と List-Unsubscribe の動作確認）。本番投入の前提。
- [04-monitoring-and-thresholds.md](./lifecycle-notifications/04-monitoring-and-thresholds.md) — 4. 監視（配信停止率・苦情率の集計 SQL、成功指標の定義）と 5. しきい値と対応（注意域 / 危険域・停止手順）。
- [05-troubleshooting.md](./lifecycle-notifications/05-troubleshooting.md) — 6. トラブルシュート（届かない / 二重送信 / opt-out 無視 / 無効なリンク / PII 混入）。
