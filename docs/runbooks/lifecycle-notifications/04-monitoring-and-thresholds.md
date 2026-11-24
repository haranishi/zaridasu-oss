## 4. 監視（ガードレール / FR-234-10・AC-08）

カテゴリ別の配信停止率・苦情率を定期的に見る:

```sql
SELECT * FROM public.get_lifecycle_unsubscribe_rate(30);  -- 直近 30 日
-- category / sent_count / unsub_count / complaint_count / unsubscribe_rate
```

- Resend の bounce / complaint Webhook を受ける場合は `lifecycle_email_log` に
  `event='bounced' / 'complained'` を INSERT する経路を足す（任意・後続）。現状は送信と
  List-Unsubscribe 経由の配信停止を記録している。
- 可視化は **REQ-233（卒研 KPI ダッシュボード）/ REQ-232（GA4）** と連携（本 REQ は指標を定義・記録し、
  ダッシュボード実装は渡す。重複させない）。

### 成功指標（送信数で評価しない）

- **復帰率**: 休眠復帰メール送信後、一定期間内に再活動（投稿/コメント/サインイン）したユーザの割合。
- **継続率（リテンションカーブの平坦化）**: コホート別の継続観察率。これが平らになるほど PMF に近い。
- 「送信数」は虚栄の指標。多く送ること自体を目標にしない。

---

## 5. しきい値と対応（頻度を下げる/止める運用ルール）

`get_lifecycle_unsubscribe_rate(30)` を基準に、カテゴリ単位で判断する。

| 指標 | 注意（頻度を下げる検討） | 危険（即停止） |
|---|---|---|
| 配信停止率 `unsubscribe_rate` | > 0.5%（0.005） | > 2%（0.02） |
| 苦情率 `complaint_count / sent_count` | > 0.1%（0.001） | > 0.3%（0.003。Resend/メールボックス事業者の一般的上限） |

対応:
1. **危険域**: 当該カテゴリの cron ジョブを停止する。
   ```sql
   SELECT cron.unschedule('lifecycle_dormant_reengage_daily');  -- または lifecycle_weekly_digest
   ```
   研究採用通知はトリガー駆動なので、必要なら `adopt_post_research` の運用を一時停止する。
2. **注意域**: 頻度を下げる（休眠の再送下限 `DORMANT_RESEND_MIN_DAYS` を 30→60 に、週次を隔週に等）。
   Edge Function の env 調整 or cron スケジュール変更で対応（migration の再適用は不要）。
3. 原因（文面・頻度・セグメント）を見直し、ステージング再検証してから戻す。

---
