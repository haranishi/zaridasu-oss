# REQ-153: 重いモーダルが静的 import されており初期バンドルを肥大化させている

## 背景
ザリダスでは投稿の編集・削除・通報をモーダル（ダイアログ）で行う。これらのモーダルは「オーナーが編集ボタンを押した時」「通報ボタンを押した時」など、条件を満たしたユーザー操作後にのみ描画される。一方、`DetailPage` では地図（react-leaflet）を `next/dynamic` で `ssr: false` 化済みであり（`src/views/DetailPage.tsx:20-31`）、クライアント専用かつ重いコンポーネントを遅延ロードするパターンが既に確立している。

## 現状の問題
編集・削除・通報モーダルが、条件付きでしか描画されないにもかかわらず静的 import されており、各画面の初期 JS バンドルに常時含まれている。

該当箇所:
- `src/components/features/posts/PostCard.tsx:16`
  ```tsx
  import EditDialog from '../../modals/EditDialog'
  ```
  `EditDialog` は `showEdit` が true のときだけ描画される（`PostCard.tsx:226-235`）が、投稿一覧に並ぶ全 PostCard の初期バンドルに含まれる。
- `src/components/features/dashboard/MyPostsSection.tsx:16-17`
  ```tsx
  import EditPostDialog from '@/components/modals/EditDialog'
  import DeletePostDialog from '@/components/modals/DeleteDialog'
  ```
  どちらも `editTarget`／`deleteTarget` が非 null のときだけ描画される（`MyPostsSection.tsx:277-296`）。
- `src/views/DetailPage.tsx:9,14`
  ```tsx
  import ReportModal from '@/components/modals/ReportModal'   // :9
  import EditDialog from '@/components/modals/EditDialog'      // :14
  ```
  `ReportModal` は `showReport` が true のときのみ（`DetailPage.tsx:530`）、`EditDialog` は `showEdit` が true かつオーナーのときのみ（`:532-541`）描画される。

地図は `DetailPage.tsx:20-31` で既に `dynamic(..., { ssr: false, loading: ... })` 化されているのに対し、上記モーダル群は同じく「初期表示に不要・操作後に出る」性質を持つにもかかわらず静的 import のままで、対比上も改善余地が明確である。

## 目的
編集・削除・通報モーダルを `next/dynamic` で遅延ロード（`ssr: false`）に変更し、各画面（投稿一覧・ダッシュボード・詳細）の初期バンドルからモーダルのコードを切り離す。モーダルを開くまで該当チャンクを読み込まないようにして、初期 JS と TTI を改善する。

## 要件
### 機能要件
- [ ] FR-153-01: `PostCard.tsx:16` の `EditDialog` 静的 import を `next/dynamic` による動的 import（`{ ssr: false }`）に置き換える。`showEdit` が true になるまでチャンクが読み込まれないこと。
- [ ] FR-153-02: `MyPostsSection.tsx:16-17` の `EditPostDialog`／`DeletePostDialog` 静的 import を `next/dynamic`（`{ ssr: false }`）に置き換える。
- [ ] FR-153-03: `DetailPage.tsx:9,14` の `ReportModal`／`EditDialog` 静的 import を `next/dynamic`（`{ ssr: false }`）に置き換える。
- [ ] FR-153-04: 各モーダルの props（例: `EditDialog` の `post/onSave/onCancel/saving/dark/error`、`DeleteDialog` の `post/onConfirm/onCancel/deleting/dark/error`、`ReportModal` の `postId/onClose`）が動的 import 後も型・挙動とも維持されること。
- [ ] FR-153-05: 既存の `DetailMap`（`DetailPage.tsx:20-31`）の dynamic 化パターンに倣い、必要に応じて `loading` プレースホルダの方針を統一する（モーダルは開いた瞬間に出るため `loading` 表示は最小限で可）。

### 非機能要件（該当する場合）
- [ ] NFR-153-01: 投稿一覧・ダッシュボード・詳細の各初期 JS バンドルサイズが、変更前より減少していること（`ANALYZE=true` のバンドル解析で確認）。
- [ ] NFR-153-02: モーダルを開いた際の追加チャンク読み込みによる体感遅延が許容範囲（操作後に視認できる固まりがない）であること。

## 受入条件
- [ ] AC-01: `ANALYZE=true npm run build`（または相当のバンドル解析）で、EditDialog/DeleteDialog/ReportModal のコードが各画面の初期チャンクから分離され、別チャンクに切り出されていることを確認できる。
- [ ] AC-02: 編集・削除・通報の各操作（PostCard・MyPostsSection・DetailPage 全経路）が従来どおり動作し、保存/削除/通報の成功・エラー表示が変わらない。
- [ ] AC-03: `next build` がエラー・型エラーなく完了する。

## 影響範囲
- `src/components/features/posts/PostCard.tsx`（`:16`、`:226-235`）
- `src/components/features/dashboard/MyPostsSection.tsx`（`:16-17`、`:277-296`）
- `src/views/DetailPage.tsx`（`:9,14`、`:530-541`）
- モーダル本体: `src/components/modals/EditDialog`, `DeleteDialog`, `ReportModal`（実装変更は不要、import 形態のみ変更）

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 機能影響はなくパフォーマンス改善目的。地図で確立済みの dynamic パターンを横展開するだけで初期バンドルを縮小でき、リスクが低く効果が見込める。
