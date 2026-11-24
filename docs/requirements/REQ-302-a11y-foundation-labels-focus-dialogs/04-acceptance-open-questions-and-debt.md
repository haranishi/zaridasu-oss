## 受入基準

- **AC-01**: `eslint.config.js` の JS/JSX・TS/TSX 両ブロックに `jsxA11y.flatConfigs.recommended` のルールが適用されており、**問題B の19件・問題G の3件と同種の違反を新規に追加すると `npm run lint` が検出する**（意図的な違反コードで確認する）。
- **AC-02**: 問題B の19件すべてが a11y ツリー上でアクセシブルネームを持つ（axe の `label` / `select-name` 違反ゼロ）。
- **AC-03**: 任意のモーダル（11件のいずれか）をキーボードで開いて閉じたとき、**フォーカスが開く前のトリガー要素へ戻る**。Tab をページ先頭からやり直す必要がない。
- **AC-04**: ドロワーメニューが閉じている状態で Tab をページ末尾まで送っても、**ドロワー内のコントロールにフォーカスが入らない**。閉状態で `aria-modal="true"` が DOM に存在しない。
- **AC-05**: フィルタードロワーと iOS ガイドモーダルが、**開いた直後に Escape で閉じられる**。スクリーンリーダーで開いたときにダイアログ名が読み上げられる。
- **AC-06**: `ReportModal` のコメント欄が支援技術上で必須と読み上げられない（可視表示の「任意」と一致する）。
- **AC-07**: 言語を en に切り替えた状態で `DeleteDialog` を開いたとき、可視ラベルとアクセシブルネームが一致する（日本語が読み上げられない）。
- ~~**AC-08**: `/dashboard` に `<h1>` が1つ存在する。~~ → **REQ-315 AC-08 で検証**（本REQの検収対象外）。
- **AC-09**: 11モーダル ＋ 主要ビューの axe テストが追加され、`critical` / `serious` 違反ゼロでパスする。
- **AC-10**: 追加した i18n キーが ja/en/ko/zh 4言語すべてに存在し `npm run i18n:check` がパスする。
- **AC-11**: `lint` / `type-check` / 既存652テストがパスする（本要件で追加したテストを含めて緑）。

## 検討事項 / 要確認

- FR-302-01 の recommended 導入によって、**本要件の対象外ファイルでも警告が出る可能性がある**（管理画面・LP など）。全量を確定してから、ルール単位の error 昇格範囲を決めること。
- `inert` 属性のブラウザサポートと React の型定義。`hidden` ＋ `tabindex` の組み合わせで代替する場合の挙動差を実機で確認する（FR-302-07）。
- 問題D の修正で `DrawerMenu` を条件付きマウントにすると、**スライドイン/アウトのトランジション（`:62-65`）が閉じるアニメーション中に消える**。アニメーション完了後にアンマウントする実装が必要か要確認。

---

## 実施後に残った技術的負債（2026-07-30）

FR-302-01 で jsx-a11y recommended の34ルールを **error** に昇格させた際、**変更禁止範囲にあった既存違反を「ファイル限定 off」で除外**して緑にした。ルール自体は error のままなので**新規の退行は検出できる**が、以下は未修正のまま残っている。除外リストが増え続けないよう、後続のa11y作業で回収すること。

| ルール | 除外中のファイル | 想定される修正 |
|---|---|---|
| `jsx-a11y/control-has-associated-label` | `SpeciesDexCard.tsx` / `AdminCommentsPage.tsx` / `AdminExperimentsPage.tsx` / `AdminPostsPage.tsx` / `AdminUsersPage.tsx` | アイコンのみ／空のインタラクティブ要素にアクセシブルネームを付与 |
| `jsx-a11y/media-has-caption` | `AudioRecorder.tsx` / `AudioPlayer.tsx` | 鳴き声音声にキャプション/トランスクリプトは現実的でないため、**除外を恒久化する判断**もありうる（WCAG 1.2.1 は「メディア代替」を要求するが、自然音の観測記録という性質を考慮する）。判断してコメントに根拠を残すこと |
| `jsx-a11y/no-noninteractive-element-interactions` | `MicPermissionGuide.tsx` / `PostForm.tsx` / `SurveyRequestForm.tsx` / `PhotoViewer.tsx` | 背景クリックで閉じる div 等。`useEscapeKey`（document リスナ）で代替経路は確保済みなので、**個別 disable ＋理由コメント**に落とすのが妥当 |
| `jsx-a11y/no-redundant-roles` | `AdminAiCostPage.tsx` | 冗長な `role` の削除（軽微） |

あわせて `label-has-for` は非推奨かつ正しい `htmlFor`/`id` にも誤警告するため全体 off とし、後継の `label-has-associated-control` を error にしている（この判断は維持してよい）。

### 実装箇所が要件文面とズレている点
要件では `Header.tsx:110-121` の常時マウントを指摘したが、実装は `DrawerMenu` 内部で `mounted ? … : null` する方式を採った。ガードがコンポーネントに閉じるため保守上はむしろ妥当だが、**`Header.tsx` は未変更**である点を認識しておくこと。`useProgress(open ? user?.id : undefined)` は早期 return より前の外殻に維持されており、REQ-278 FR-278-01 の progress 保持は壊れていない。
