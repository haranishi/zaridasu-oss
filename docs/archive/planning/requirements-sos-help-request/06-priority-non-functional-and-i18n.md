## 8. 改善提案一覧（実装優先度）

| 優先度 | 改善項目 | 影響度 | 実装コスト | 推奨対応 |
|--------|----------|--------|------------|----------|
| **高** | DB: info_type に `sos` 追加 + SOS専用カラム | 大 | 小 | Phase 1 |
| **高** | DB: `sos_responses` テーブル作成 | 大 | 小 | Phase 1 |
| **高** | UI: PostForm に SOS専用フィールド追加 | 大 | 中 | Phase 1 |
| **高** | UI: マップにSOSピン（オレンジ+パルス）表示 | 大 | 中 | Phase 1 |
| **高** | UI: 詳細ページに「協力する」ボタン+応答者表示 | 大 | 中 | Phase 1 |
| **高** | API: SOS即時承認ロジック（auto_approved） | 大 | 小 | Phase 1 |
| **中** | API: `notify-sos` Edge Function（エリア通知） | 中 | 中 | Phase 2 |
| **中** | API: `notify-sos-response` Edge Function | 中 | 中 | Phase 2 |
| **中** | DB: 自動期限切れ cron ジョブ | 中 | 小 | Phase 2 |
| **中** | UI: SOSステータス変更（解決済み） | 中 | 小 | Phase 2 |
| **中** | UI: FilterBar にSOSフィルター追加 | 中 | 小 | Phase 2 |
| **中** | DB: user_profiles にSOS通知設定カラム追加 | 中 | 小 | Phase 2 |
| **低** | UI: SOS専用一覧ビュー（マイページ内） | 小 | 中 | Phase 3 |
| **低** | バッジ: 「助っ人マスター」等の協力バッジ | 小 | 小 | Phase 3 |
| **低** | Push通知: ブラウザPush対応 | 小 | 大 | 将来 |

---

## 9. 非機能要件

### パフォーマンス
- SOSピンのパルスアニメーションは CSS のみ（JS不使用）で実装し、描画負荷を最小化
- sos_responses のカウントは posts テーブル側にキャッシュカラム `sos_response_count` を持たせ、JOINを減らす
- マップクラスタリングは通常ピンと同じ MarkerClusterGroup 内で処理

### セキュリティ
- SOS投稿は**認証ユーザー限定**（RLS で `auth.uid() IS NOT NULL` を強制）
- 応答も認証必須、1ユーザー1応答の UNIQUE 制約
- 連絡先（希望日時等）は投稿者本人と応答者のみ閲覧可能にする場合は、RLS で制御

### アクセシビリティ
- SOSピンの色（オレンジ #F59E0B）はWCAG AA基準のコントラスト比を確保
- 「協力する」ボタンは最低 44x44px のタップターゲット
- パルスアニメーションは `prefers-reduced-motion` で無効化
- スクリーンリーダー: SOSピンに `aria-label="助っ人募集: {カテゴリ}"` を付与

### レスポンシブ
- SOS専用フィールドはモバイルでスタック表示（1カラム）
- 応答者一覧はスクロール可能なリスト（最大高さ制限）

---

## 10. i18n キー設計

```json
{
  "infoType": {
    "sos": "助っ人募集"
  },
  "sos": {
    "categoryLabel": "募集カテゴリ",
    "categories": {
      "capture_help": "捕獲支援",
      "survey": "調査協力",
      "equipment": "機材貸出",
      "other": "その他"
    },
    "urgencyLabel": "緊急度",
    "urgency": {
      "high": "急ぎ",
      "medium": "ふつう",
      "low": "いつでも"
    },
    "desiredDate": "希望日時",
    "maxPeople": "募集人数",
    "respondButton": "協力する！",
    "respondedButton": "応答済み（取消）",
    "resolveButton": "解決済みにする",
    "statusOpen": "募集中",
    "statusResolved": "解決済み",
    "statusExpired": "期限切れ",
    "responseCount": "{{count}}人が応答",
    "resolvedComment": "解決コメント",
    "notifyTitle": "SOS通知設定",
    "notifyEnabled": "エリア内のSOS通知を受け取る",
    "notifyUrgencyOnly": "緊急度「急ぎ」のみ通知"
  }
}
```
