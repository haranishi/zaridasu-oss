## 影響範囲

### コード変更
| ファイル | 変更内容 | 推定行数 |
|---|---|---|
| `src/components/common/OpenInGoogleMapsButton.tsx`（新規） | 共通コンポーネント | +50〜70 |
| `src/views/SurveyRequestPage.tsx` | import + コンポーネント配置 | +3 / -0 |
| `src/views/DetailPage.tsx` | import + コンポーネント配置 | +3 / -0 |
| `src/i18n/*.json` | （任意）`common.openInGoogleMaps` キー追加 | +4 / -0 |

### 環境変数
**該当なし**（API キー不要）

### DB / API / Storage
**該当なし**

### 既存テストへの影響
- `DetailPage` / `SurveyRequestPage` のスナップショットテストがあれば差分が出る → 更新必要
- `OpenInGoogleMapsButton` の単体テストを新規追加すべき:
  - 正常座標で `<a>` がレンダリングされ、`href` が期待 URL
  - 不正座標（NaN / 範囲外）で `null` を返す
  - `aria-label` が設定されている

---

## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-091-01 | `/request/[id]` で地図直下に「📍 Google Maps で経路を表示」ボタンが表示される |
| AC-091-02 | `/post/[id]` で地図カード内にボタンが表示される |
| AC-091-03 | ボタン押下で Google Maps が新しいタブ / アプリで開き、ピンが正しい座標に立つ |
| AC-091-04 | 経路モードで現在地（許可時）から目的地までの経路が表示される |
| AC-091-05 | iOS Safari (Google Maps アプリ有) でアプリが起動する |
| AC-091-06 | iOS Safari (アプリ無) でブラウザ内 Google Maps が開く |
| AC-091-07 | Android Chrome / PC Chrome / Firefox / Edge で同様に動作する |
| AC-091-08 | 緯度経度が NaN / 範囲外の場合はボタンが描画されない |
| AC-091-09 | スクリーンリーダーが「Google Maps で経路を表示（新しいタブで開く）」と読み上げる |
| AC-091-10 | キーボードのみで Tab → ボタンに到達、Enter で発火 |
| AC-091-11 | ダーク / ライトモード両方でコントラスト 4.5:1 以上 |
| AC-091-12 | 「協力する」「クローズ」など主要 CTA のレイアウトが崩れない |
| AC-091-13 | `npx tsc --noEmit` と `npx next build` がエラーなく成功する |
| AC-091-14 | URL に渡す座標は小数 6 桁に丸められている（既存の位置情報粒度ポリシーと整合） |

---
