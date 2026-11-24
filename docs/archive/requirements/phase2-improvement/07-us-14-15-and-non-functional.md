### US-14: 月次レポート自動生成

```
As a 行政担当者・研究者,
I want to 月次の外来生物出没レポートを自動生成してほしい,
So that 定期報告の作成工数を削減できる.

受け入れ条件:
- [ ] Supabase Edge Function で毎月1日にレポートを自動生成する
- [ ] レポート内容: 月間投稿数、種別割合、地域別ヒートマップ、前月比
- [ ] PDF 形式でダウンロード可能にする
- [ ] 管理者にメールでレポートリンクを自動送信する
- [ ] /trends ページにレポートアーカイブセクションを追加する
```

**優先度: 低** | **影響度: 中** | **実装コスト: 大**

---

### US-15: WCAG 2.1 AA アクセシビリティ準拠

```
As a スクリーンリーダー利用者,
I want to すべての機能をキーボードとスクリーンリーダーで操作したい,
So that 視覚障害があっても外来生物の報告に参加できる.

受け入れ条件:
- [ ] 動的コンテンツ更新箇所（トースト、通知、エラー）に aria-live を追加する
- [ ] 全モーダルに aria-labelledby で見出しを関連付ける
- [ ] 装飾的なアイコン・絵文字に aria-hidden="true" を追加する
- [ ] BottomNav に aria-current="page" を追加する
- [ ] フォーカスインジケーター（focus-visible:ring）を全インタラクティブ要素に適用する
- [ ] カラーコントラスト比を全テキスト・アイコンで 4.5:1 以上にする
- [ ] 地図操作のキーボード代替手段を提供する（住所入力で位置指定）
- [ ] axe-core による自動アクセシビリティテストを CI に組み込む
```

**対象コンポーネント一覧:**

| コンポーネント | 必要な修正 |
|--------------|-----------|
| Header.tsx | ドロップダウンの focus 管理改善 |
| BottomNav.tsx | aria-current, aria-label の i18n 対応 |
| AuthModal.tsx | aria-labelledby を h2 に紐付け |
| PostForm.tsx | honeypot に aria-hidden, fieldset 追加 |
| HowToSection.tsx | aria-expanded 追加, 装飾絵文字に aria-hidden |
| SignupBanner.tsx | role="complementary", aria-live 追加 |
| MapView.tsx | キーボード操作の代替手段 |
| CommentSection.tsx | 新着コメントに aria-live |
| Toast/ToastContext | aria-live="polite" または role="status" |

**優先度: 中** | **影響度: 中** | **実装コスト: 中**

---

## 4. 非機能要件

### NFR-01: パフォーマンス

| 指標 | 現状（推定） | 目標値 |
|------|-------------|--------|
| LCP (Largest Contentful Paint) | 未計測 | < 2.5s |
| FID (First Input Delay) | 未計測 | < 100ms |
| CLS (Cumulative Layout Shift) | 未計測 | < 0.1 |
| Realtime 遅延 | N/A | < 3s |
| API レスポンス (p95) | 未計測 | < 500ms |
| 投稿一覧初回表示 | 未計測 | < 1.5s |

### NFR-02: セキュリティ（追加）

- [ ] 公開 API に API キー認証またはレート制限を実装する
- [ ] プッシュ通知の VAPID キーを安全に管理する
- [ ] notifications テーブルに RLS を適用する
- [ ] GeoJSON エクスポートに個人情報（user_id）を含めない

### NFR-03: スケーラビリティ

- [ ] Realtime 接続数: 同時 500 接続以上に対応する
- [ ] 公開 API: 100 req/min/ユーザーのレート制限
- [ ] 通知: 1000 件/分の処理能力を確保する

### NFR-04: 可観測性

- [ ] Sentry でエラー率 < 0.1% を維持する
- [ ] Web Vitals を継続的に計測し、パフォーマンスバジェットを設定する
- [ ] GA4 でユーザーファネル（訪問→投稿→会員登録）を計測する

---

