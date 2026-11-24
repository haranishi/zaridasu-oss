## 影響範囲

### コード変更
| ファイル | 変更内容 | 推定行数 |
|---|---|---|
| `src/components/layout/Header.tsx` | `onSurveyClick` を destructure し `<DrawerMenu>` に転送 | +2 / -1 |
| `src/components/layout/DrawerMenu.tsx` | Props 型に `onSurveyClick?: () => void` 追加、メニュー項目（button）を追加 | +15〜20 |
| `src/views/SurveyRequestsListPage.tsx` | FAB 追加 + `SurveyRequestForm` の条件付きマウント + `useState` + `useAuth` import + ハンドラ | +30〜40 |
| `src/views/HomePage.tsx` | 既存実装を流用するため変更不要（`onSurveyClick` は既に `Header` に渡している） | 0 |

### 環境変数
**該当なし**

### DB / API / Storage / マイグレーション
**該当なし**

### 既存テストへの影響
- `Header` のテスト（あれば）: Props 追加に伴う型チェック影響あり、optional のため既存呼び出しは破壊しない
- `DrawerMenu` のテスト（あれば）: 新メニュー項目の存在確認テストを追加すべき（任意）
- `SurveyRequestsListPage` のテスト（現時点で未作成）: 新規追加時に FAB と form open の挙動をテスト対象に含めるべき

---

## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-090-01 | 任意の画面で左上ハンバーガー → 「🔍 調査依頼を立てる」が見える（ログイン状態問わず） |
| AC-090-02 | ログイン済ユーザーがメニュー項目をタップすると `SurveyRequestForm` が開く |
| AC-090-03 | 未ログインユーザーがメニュー項目をタップすると `AuthModal`（signup タブ）が開く（HomePage 既存挙動） |
| AC-090-04 | `/requests` ページ右下に FAB が常時表示される |
| AC-090-05 | ログイン済ユーザーが FAB をタップすると `SurveyRequestForm` が開く |
| AC-090-06 | 未ログインユーザーが FAB をタップすると `/auth` に遷移する |
| AC-090-07 | フォーム送信成功で一覧が再取得され、新規依頼が先頭に出る |
| AC-090-08 | iPhone Safari で FAB が BottomNav と home indicator のいずれにも被らない |
| AC-090-09 | キーボードのみで FAB / メニュー項目に到達でき、Enter で発火する |
| AC-090-10 | スクリーンリーダーが「調査依頼を立てる」と読み上げる（`aria-label` 検証） |
| AC-090-11 | ダークモード / ライトモード両方で FAB のコントラストが視認可能 |
| AC-090-12 | `npx next build` がエラーなく成功する |

---
