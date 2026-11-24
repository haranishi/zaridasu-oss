## 6. 通知設計（Edge Function）

### 6.1 `notify-sos` Edge Function

```
トリガー: posts INSERT WHERE info_type = 'sos'
対象: 同一 municipality の user_profiles WHERE sos_notify_enabled = true
条件: sos_notify_urgency_only = true の場合、sos_urgency = 'high' のみ送信

メール内容:
  件名: 🆘 {municipality}で助っ人募集が投稿されました
  本文:
    - SOSカテゴリ / 緊急度
    - 投稿者コメント（抜粋100文字）
    - 「マップで確認する」ボタン → /post/{id}
```

### 6.2 `notify-sos-response` Edge Function

```
トリガー: sos_responses INSERT
対象: 該当SOS投稿の user_id（依頼者）

メール内容:
  件名: 🤝 あなたの助っ人募集に応答がありました
  本文:
    - 応答者名 + メッセージ
    - 現在の応答者数
    - 「詳細を見る」ボタン → /post/{id}
```

---

## 7. 承認フロー

SOSは即時公開（admin承認を挟まない）。理由:

- 緊急性が高く、承認待ちでは機能しない
- 認証ユーザー限定のため、匿名スパムリスクが低い
- 不適切なSOSはレポート機能で事後対応

```
通常投稿:  投稿 → pending → admin承認 → approved → マップ表示
SOS投稿:   投稿 → approved（自動） → マップ表示 → 解決/期限切れ
```

ただし、以下の自動チェックは適用:
- レート制限: 24時間以内に3件まで（通常投稿とは別カウント）
- スパム検知: ハニーポットフィールド
- 位置検証: 秋田県範囲内チェック

---

