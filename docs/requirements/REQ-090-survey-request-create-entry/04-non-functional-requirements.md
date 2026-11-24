## 非機能要件

### パフォーマンス
- FAB / メニュー項目の追加によるレンダリングコスト増は無視できる範囲（< 1ms）
- `SurveyRequestForm` のマウントは現状 `dynamic import` ではなく直接 import で十分（モーダルサイズが小さく、初回表示に支障なし）。バンドル増を懸念するなら `dynamic(() => import(...), { ssr: false })` を採用可

### セキュリティ
- DB 側の防衛線は既存 RLS（`survey_requests` テーブル）と `useSurveyRequests.createRequest` の入力バリデーションが担う。本要件では **クライアント UI の追加のみ**で新規攻撃面は発生しない
- 未ログインユーザーが UI 上から `SurveyRequestForm` を直接呼んでも、フォーム内 `if (!user) return null` と DB RLS の二重防衛で書き込み不可

### 可用性・信頼性
- FAB / メニュー項目は React コンポーネントの単純追加で副作用なし
- 既存 `SurveyRequestForm` のハングや送信失敗時の挙動は不変

### アクセシビリティ（WCAG 2.1 AA 準拠項目）
- **1.4.3 コントラスト比**: FAB の背景色とアイコンのコントラストは 4.5:1 以上（red-500 + white で達成）
- **2.1.1 キーボード操作**: Tab で到達、Enter / Space で発火
- **2.4.7 フォーカスの可視化**: フォーカスリング（`focus-visible:ring-2`）
- **2.5.5 ターゲットのサイズ**: FAB は 56×56px 以上推奨（Material Design FAB 標準）
- **4.1.2 名前・役割・値**: `aria-label="調査依頼を立てる"`、`type="button"`

### レスポンシブ対応
- **ブレークポイント**: `sm` (640px) 未満（モバイル）/ `sm` 以上（タブレット・PC）
- **モバイル（< 640px）**:
  - FAB は右下 `right-4 bottom-20`（BottomNav `h-14` + 余白 + safe-area-inset-bottom）
  - `style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}` 推奨
- **タブレット・PC（≥ 640px）**:
  - FAB は同位置でも違和感なし。BottomNav が出るかは `BottomNav.VISIBLE_PATHS` 次第（`/requests` は現状未登録のため出ない）→ `bottom-6` 程度でも可
- **ドロワーメニュー項目**: 既存メニュー項目と同サイズ（py-4）で揃える

---
