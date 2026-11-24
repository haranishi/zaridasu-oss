## 背景

本REQは**単独では起票する価値が薄い Low 項目を、性質ごとにまとめて一度で片付ける**ためのものである。7項目あり、すべてに共通するのは「**同じリポジトリ内に正しい実装が既にあり、そこだけ揃っていない**」という形をしている点である。したがって修正方針を新たに設計する必要はなく、既存の前例に合わせるだけで済む。

| 問題 | 既にある正しい実装（前例） |
|---|---|
| A: 二重送信ガードの適用漏れ | `PostForm.tsx:175` / `SurveyRequestForm.tsx:81`（REQ-223 FR-223-08） |
| B: 日時のロケール固定 | `ProfilePage.tsx:20` / `SpeciesDexCard.tsx:12`（`DATE_LOCALE_TAG` マップ） |
| B: blob URL の解放 | `usePostForm.ts:56-64` |
| C: サインアウトの await | `AdminLayout.tsx:144-147` |
| D: 処理中の閉鎖抑止 | `DashboardPage.tsx:103-104`（同一コンポーネント内のキャンセルボタン） |
| E: タイマーの cleanup | `FilterBar.tsx:58-59` |
| F: 主題見出し | `src/app/(home)/page.tsx:17`（sr-only h1） |
| G: 実行リージョンの明示 | （前例なし。`vercel.json` に設定を書くこと自体が新規） |

> **重複回避の相互参照**: 問題Aの3系統のうち `AdminPostsPage.tsx:93-103`（`handleBulkDelete` / `handleBulkApprove`）は **REQ-295（管理画面の操作安全性とデータ整合）** が一括操作そのものを作り直す対象であり、`EditProfileModal.tsx:85-105` は **REQ-301（認証フローのUX堅牢化）／REQ-313（状態同期の信頼性）** がプッシュ通知トグルとプロフィール保存の失敗表示で同じハンドラに触れる。**REQ-295 / REQ-301 / REQ-313 のいずれかが先に着手された場合は、その中で同期ガードを入れて本REQの該当分を消化してよい**（同じ行を二度書き換えない）。

---
