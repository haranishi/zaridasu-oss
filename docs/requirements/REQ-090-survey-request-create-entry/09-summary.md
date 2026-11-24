## サマリー

REQ-085 で一覧ページを作ったが、**「依頼を立てる」UI 入口がコードベース上どこにも描画されておらず**、`HomePage.OPEN_SURVEY_FORM` と `Header.onSurveyClick` が dead-code 化していた既存バグを解消する要件。

修正は以下の小規模な 2 箇所:
1. **DrawerMenu に新規メニュー項目** — グローバルな入口、Header → DrawerMenu の Props 配線も復旧
2. **/requests に FAB** — 一覧を見ているユーザーが最も自然に「自分も立てる」へ進める動線

DB / API / マイグレーションの変更なし、UI 追加のみ。実装後は REQ-086〜089 の動作確認も初めて実機で可能になる。

### 次のアクション
1. `Header.tsx` の destructure 修正と `DrawerMenu.tsx` への Props / メニュー項目追加（最小コミット）
2. `SurveyRequestsListPage.tsx` に FAB と `SurveyRequestForm` マウント追加
3. `npx tsc --noEmit` + `npx next build` で型・ビルド確認
4. `npm run dev` で実機（iPhone Safari / Chrome / Firefox）目視確認、AC-090-01〜12 を順にチェック
5. 動作確認 OK 後、REQ-086〜089 の手動 E2E 確認に進む
