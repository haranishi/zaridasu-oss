### 未実装（次の波）

- **FR-293-07 の「送信を再開」ボタン**（`PendingPostsSection.tsx`）: ラベルに新規 i18n キーが必要で、
  `src/locales/` は別作業と競合するため着手していない。**現状でも救出は可能**（5 分経過後の
  `refresh()` で自動的に `'pending'` へ戻り `sendAll` の対象に復帰する＝AC-09 の「削除以外の脱出路」は成立）。
  ボタンは「5 分待たずに即座に再送する」ための UX 改善として残っている。
- **FR-293-08 の残り**: manifest 配信の E2E（AC-01 / AC-02）は `tests/e2e/pwa-delivery.spec.ts` で入ったが、
  次の 2 つが未実装。
  - **「オフライン下書きに到達できる」E2E**（`context.setOffline(true)` でコールドスタートし投稿フォームに
    到達する検証）→ **AC-05 の「この一連がE2Eで検証されている」条件は未達**。現状のカバレッジは
    `scripts/__tests__/build-sw.test.ts` の SW 単体テスト（フェイク Cache Storage / fetch で
    「オフライン時にウォーム済み HTML が返る」ことを検証）まで。
    なお e2e は webServer に placeholder Supabase URL を注入する構成のため、写真入力から
    「下書きに保存」まで通す検証は REQ-311 の認証付き e2e 基盤に依存する。
  - **`.lighthouserc.json` の manifest 系 assertion**（`installable-manifest` 等）。未確定事項 4 も未定のまま。
- **実機確認が必要な AC**: AC-03（iOS Safari で A2HS → standalone 起動）・AC-04（WebKit でオフライン画面）・
  AC-06（デプロイ後に `/_next/static/` と `/images/` のキャッシュが保持されている）・
  AC-08（en/ko/zh でのオフライン画面表示）は実機/ブラウザでの確認が残っている。
