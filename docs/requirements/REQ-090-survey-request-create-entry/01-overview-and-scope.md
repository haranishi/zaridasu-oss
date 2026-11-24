## 要件概要

### 背景・目的
`SurveyRequestForm`（`src/components/modals/SurveyRequestForm.tsx`）と DB（`survey_requests` テーブル）は既に存在し、依頼を立てる機能自体は実装済み。しかし **UI 上の入口がどこにも描画されていない** ため、ユーザーは依頼を立てる手段を持たない。

具体的な現状:
- `HomePage` は `dispatch({ type: 'OPEN_SURVEY_FORM' })` を呼ぶ口を持つ（`src/views/HomePage.tsx:158`）が、その引き金となる UI が無い
- `Header` は `onSurveyClick` を Props で受け取るが **destructure しておらず使用していない**（`src/components/layout/Header.tsx:27`）
- `BottomNav` も `onSurveyClick` を受け取るが **依頼ボタンを描画していない**
- `DrawerMenu` には `onSurveyClick` Props 自体が存在しない

結果として、Phase 1（REQ-085 一覧）は閲覧側のみが成立し、新規依頼の発生源がゼロ。**REQ-086〜089（結果投稿 / 協力 / 通知 / コメント）の動作確認も実質不可能**な状態。

### スコープ
**含む:**
- `DrawerMenu` に「🔍 調査依頼を立てる」項目を追加し、`onSurveyClick` Props を追加
- `Header` の `onSurveyClick` Props を実際に destructure し `DrawerMenu` に渡す配線
- `SurveyRequestsListPage`（`/requests`）の右下に「+ 新規依頼」FAB（Floating Action Button）を追加
- `SurveyRequestsListPage` 内に `SurveyRequestForm` を直接マウントし、開閉とフォーカストラップを管理
- 未ログイン状態のフォールバック（AuthModal の login タブへ誘導 / `/auth` へ遷移）

**含まない:**
- `BottomNav` への追加（5 タブ既に埋まっており、依頼は投稿より低頻度のため見送り）
- `HomePage` の地図 UI 上への直接ボタン配置（地図 UI が既に密度高く、優先度低）
- `SurveyRequestForm` 本体の UI / バリデーション改修
- 新規 DB スキーマ・マイグレーション・API
- i18n 文言の本格対応（既存 `t('survey.*')` キーがあれば流用、無ければハードコード可）

### 前提条件・制約
- 既存 `SurveyRequestForm` の API（`{ onClose, onSuccess? }`）はそのまま使う。改修不可
- ログイン必須（`SurveyRequestForm` 自体が `if (!user) return null` で防衛している）
- 未ログイン時は **モーダルを開かず** AuthModal（login タブ）に誘導するか、`/auth` へ router.push する
- スマホ safe-area（`env(safe-area-inset-bottom)`）対応、FAB は BottomNav に重ならないこと
- `BottomNav` は固定高 `h-14` + `safe-area-inset-bottom` で `/requests` ページにも常時表示されるため、FAB は `bottom-20` 以上（`safe-area-inset-bottom` 加算）にオフセットすること
- a11y: ボタンに `aria-label`、`SurveyRequestForm` の既存フォーカストラップ挙動に従う
- ダークモード両対応（`useTheme()` の `dark` を参照）

---
