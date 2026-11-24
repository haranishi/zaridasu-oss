## リスク・トレードオフ

| リスク | 緩和策 |
|---|---|
| Google Maps の URL 仕様が変わる | URL 仕様は Google が公開・長期サポート。万一変更時もリンクが古い形式を返すだけで実害小 |
| モバイルでアプリ判定がうまく行かないユーザーがいる | 判定は OS に委譲（universal URL）。手動判定は脆く、避ける |
| 「Google にデータが渡る」プライバシー懸念 | 渡るのは座標のみ（既に投稿として公開しているもの）。`rel="noreferrer"` で referer も送らない。プライバシーポリシーへの追記は任意（既に「外部リンクは各社のポリシーに従う」程度の記述があれば十分） |
| 競合: Apple Maps / Yahoo!地図ユーザーの不満 | 後続要件で「他のアプリで開く」プルダウン追加を検討。今回は最小実装に留める |
| ボタン文言が長くてモバイルでハミ出る | `truncate` または短縮文言「📍 Maps」を fallback として用意 |
| 不正座標が DB にあると無音で消える（UX 悪） | 既存 `useSurveyRequests.createRequest` で AKITA_BOUNDS バリデーション済み。posts 側も同等のはず。問題が起きたらトラスト & ログで対応 |
| 経路モード既定で「現在地が要求される」ことに違和感 | Google Maps 側が現在地を要求する標準挙動。ユーザーが許可しなくても出発地を手動指定できるため許容 |

---

## 実装優先度と計画

| 優先度 | 項目 | 依存 | 見積もり | ステータス |
|---|---|---|---|---|
| **P0** | `OpenInGoogleMapsButton` コンポーネント実装（FR-091-01） | なし | XS | TODO |
| **P0** | `DetailPage` への組み込み（FR-091-03） | 上記 | XS | TODO |
| **P0** | `SurveyRequestPage` への組み込み（FR-091-02） | 上記 | XS | TODO |
| P1 | `OpenInGoogleMapsButton` の単体テスト追加 | 上記 | S | OPTIONAL |
| P1 | i18n キー追加（`common.openInGoogleMaps` 等） | 上記 | XS | OPTIONAL |
| P2 | iOS / Android / PC 各ブラウザで実機確認 | 全部 | XS | TODO |
| P2 | ビルド確認 (`npx next build`) | 全部 | XS | TODO |

合計工数: **XS（数時間以内）**

---

## サマリー

調査依頼や投稿の詳細ページから **ワンタップで Google Maps の経路案内 / 位置表示** を開けるようにする。Google Maps Universal URL（API キー / 認証不要）を `<a target="_blank">` で開くだけのため、新規 API / DB / 環境変数すべてゼロ。

実装は共通コンポーネント `OpenInGoogleMapsButton` を 1 つ作って 2 つの詳細ページに 1 行ずつ差し込むのみ、合計 **XS（数時間）**。これにより REQ-086（依頼 → 現地 → 結果投稿）のループの「現地に行く」工程の摩擦が一気に下がり、調査依頼機能の実用性が大きく向上する。

### 次のアクション
1. `src/components/common/OpenInGoogleMapsButton.tsx` を作成（座標バリデーション + URL 組立 + `<a>` 描画）
2. `DetailPage.tsx` の地図カードにコンポーネントを追加
3. `SurveyRequestPage.tsx` の `MiniMap` 直下にコンポーネントを追加
4. `npx tsc --noEmit` + `npx next build` で型・ビルド確認
5. `npm run dev` → iPhone Safari / Android Chrome / PC Chrome で実機確認、AC-091-01〜14 を順にチェック
6. 動作 OK 後、ユーザー指示があればコミット（push はしない）
