### 非機能要件（該当する場合のみ）

- [ ] NFR-223-01: **回帰ゼロ（既存テスト）。** `npm run lint`（`eslint . --max-warnings 0`）・`npm run test`（vitest）・既存の a11y テスト（`src/components/features/posts/__tests__/PostForm.a11y.test.tsx`、`src/components/modals/__tests__/` 配下）・PostForm/AuthModal 関連テストが全て green。`formInputCls`/`dialogInputCls` の変更は広く波及するため、共有先（LocationSection / WeatherSelector / CSVExportSection / EditDialog / ReportModal / DeleteDialog / AuthModal）の表示が崩れないこと。

- [ ] NFR-223-02: **i18n 完全性。** 追加・変更した文言キーは **ja/en/ko/zh の 4 ファイルすべてに存在**し、欠落キー（フォールバックで他言語が露出）が無いこと。i18n キー欠落検査（既存の仕組みがあればそれ、無ければ目視＋簡易チェック）を通す。

- [ ] NFR-223-03: **検証ロジックを変更しない。** 入力検証の判定（範囲・列挙・長さ・必須）そのものは REQ-029 / REQ-213 / 既存 DB CHECK の責務であり、本 REQ は**文言・入力体験・送信可否方針・二重送信ガード**のみを変更する。検証の閾値（`COUNT_MIN/MAX`・`MAX_COMMENT_LENGTH`・`MAX_SURVEY_REASON_LENGTH`〔`src/lib/constants.ts:179-181,246`〕）を変えない。

- [ ] NFR-223-04: **既存 a11y を退行させない。** PostForm の `aria-pressed`（`:326`）・`role="group" aria-labelledby`（`:316,341`）・エラーバナーの `role="alert" aria-live="assertive"`（`:257-258`）、AuthModal の `htmlFor`/`id`/`aria-invalid`/`aria-describedby`（`:326-349`）など、REQ-151/158/163 で整備済みの属性を壊さない。

- [ ] NFR-223-05: **タップ領域。** ボタン・トグル・閉じる（×）等の操作要素は最小タップ領域（概ね 44×44px 相当）を確保する。現状 PostForm の閉じる（`:225-231` `p-1.5`）等が小さい場合はパディング/ヒット領域で補う（視覚サイズを大きくしすぎない範囲で。詳細なコントラスト/トークンは REQ-224 と協調）。
