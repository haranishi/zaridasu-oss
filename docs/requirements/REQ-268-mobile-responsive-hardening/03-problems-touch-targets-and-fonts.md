### E. タッチターゲット 44px 未満（WCAG 2.5.5 / 旧 FR-002 の残り）

| 箇所 | 実測目安 | 証拠 |
|---|---|---|
| Header ハンバーガー（全ページ唯一のメニュー起動点） | ~36px | `Header.tsx:87-96` `p-2` + `size={20}` |
| FilterBar エリア絞込/フィルタボタン | ~36px | `FilterBar.tsx:135-155/158-178` `py-2.5`+`size={14}`、narrow ではアイコンのみ |
| 地図 bounds 解除× | ~22px | `MapView.tsx:661-667` `p-1`+`size={14}` |
| 地図凡例トグル / 現在地 / 近くの水域 | 38〜42px | `MapView.tsx:597-603/235-242/363-371` |
| Leaflet 既定ズーム ± | ~30px | `MapView.tsx:477`（`zoomControl` 未調整） |
| 調査依頼詳細のコメント削除/確定/取消 | **~18px** | `SurveyRequestPage.tsx:387,394,404` `text-[10px]`+`py-0.5`+`size={10}` |
| /requests フィルタ select | ~28px | `SurveyRequestsListPage.tsx:260-268` `px-2 py-1` |
| 3Dビューワ 回転/停止ボタン | 36px | `Crayfish3DViewer.tsx:232` `w-9 h-9` |
| 「3Dで見る」トグル | ~30px | `Crayfish3DStage.tsx:116` `py-1.5 text-xs` |
| 写真削除（投稿フォーム/編集） | 28px / **16px** | `PhotoUploadSection.tsx:64` `w-7 h-7`・`EditDialog.tsx:168,182` `w-4 h-4` |
| モーダル閉じる×（AuthModal/UserDetailModal/PhotoViewer） | 32〜40px | `AuthModal.tsx:400-406`・`AdminUsersPage.tsx:74-79`・`PhotoViewer.tsx:53-59` |
| species/area の地域・種別チップ、協力トグル | ~30px | `species/[species]/page.tsx:163`・`AreaPage.tsx:118,133,270`・`SurveyRequestPage.tsx:307` |
| DrawerMenu 地図タイプ3列/言語ボタン | ~34px | `DrawerMenu.tsx:190-204/253-266` |
| SignupBanner 閉じる× | ~27px | `SignupBanner.tsx:66-74` |

### F. 極小フォント（9px）と情報テキストの 10px

- **9px（要修正）**: `FilterBar.tsx:152/175`（ON・件数バッジ）、`PhotoGallery.tsx:98`（画像上の日付・白70%で低コントラスト）
- **10pxで情報を担う（下限11px推奨）**: `MapView.tsx:644/648`（ヒートマップ凡例）、`PhotoGallery.tsx:91/96`、`BarChart.tsx:40`（`sm:text-xs` 併記あり・下限のみ）
- その他の 10px はバッジ/装飾の二次情報で許容（`PostCard.tsx:133-145`、`LandingPage.tsx:404` 等）
