## 目的

- 投稿・通報・コメント・調査依頼・調査依頼コメント・定点サイト・プロフィール・座標・OG パラメータ等の入力検証を、**zod スキーマ（許可リスト方式）で宣言的に一元化**し、散在した個別 `if` 文・専用関数を共有スキーマに集約する。
- **型と検証を単一ソース化**する：zod スキーマから型を導出（`z.infer`）し、`database.types.ts` の `Insert` 型・DB CHECK 制約値（長さ・列挙）と整合させ、検証ドリフト（reason 500 vs 300 等）を解消する。
- **多層防御の役割分担を明文化**する：クライアント zod は「UX ＋第一の網（バイパス可能）」、DB の CHECK / RLS / トリガーは「敵対的入力に対する最終的な信頼境界（正本）」という位置づけを設計ドキュメント／コードコメントとして残す。Server Actions が無い以上、zod は実防御の代替にはならないことを明記する。
- zod 導入による**バンドルサイズ増を CI の perf-budget（REQ-176 / REQ-180、`size-limit`）内に収める**。

## 要件

### 機能要件

- [ ] FR-213-01: スキーマバリデーションライブラリとして **zod** を `dependencies` に追加する（`package.json`）。yup / joi / valibot は採用しない（既存 TS との親和性・`z.infer` による型導出・採用実績を理由とする）。バンドル影響は NFR-213-01 で管理する。
- [ ] FR-213-02: 共有スキーマモジュール `src/lib/validation/schemas.ts`（および必要に応じ分割ファイル）を新設し、以下の入力スキーマを **zod で許可リスト方式**として定義する。各スキーマの定数（長さ上限・列挙値・座標範囲）は **DB CHECK 制約および `src/lib/constants.ts` を正本**として参照／一致させる：
  - `postInputSchema`: `species`（`z.enum(['american','bullfrog'])`）、`info_type`（`z.enum([...])`）、`comment`（`<= 500`、`schema.sql:21,66`）、`count`（整数 1〜999、`schema.sql:26`）、`lat`/`lng`（秋田県境界 `AKITA_BOUNDS`＋DB の `-90..90`/`-180..180`、`schema.sql:16-17`）、`weather`（列挙、`schema.sql:35`）、`humidity`（0〜100）、`survey_duration_minutes`（1〜480、`schema.sql:1087`）、`survey_method`（`structured|opportunistic`）、`location_source`（`gps|manual|exif`）等。
  - `reportInputSchema`: `reason`（`z.enum(['spam','wrong_location','inappropriate','other'])`、`schema.sql:257`）、`comment`（`<= 500`、`schema.sql:270`。**UI の maxLength 300 と DB 500 の最終値を本 REQ で統一**し、定数化する）。
  - `commentInputSchema`: `content`（1〜500、`schema.sql:315`）。
  - `surveyRequestInputSchema`: `species`（`american|bullfrog|unknown`、`schema.sql:1194`）、`reason`（**1〜300**、`schema.sql:1195`。`MAX_SURVEY_REASON_LENGTH=300` `constants.ts:246` を正とし、`useSurveyRequests.ts:106-108` の 500 を 300 に修正）、`urgency`（`normal|urgent`）、座標。
  - `surveyRequestCommentInputSchema`: `body`（1〜500、migration `:8`）。
  - `surveySiteInputSchema`: `name`（1〜100、`schema.sql:1449`）、`notes`（`<= 500`）、`species`（`american|bullfrog|null`）、座標。
  - `profileUpdateSchema`: `display_name`（1〜20、`schema.sql:1098`）、`bio`（`<= 100`、`schema.sql:1100`）、`avatar_emoji` 等（部分更新を許す `.partial()`）。
  - 共通部品: `akitaLatLngSchema`（座標範囲）、`speciesSchema`、`infoTypeSchema` を再利用可能な単位で切り出す。
- [ ] FR-213-03: スキーマから型を導出し単一ソース化する。各スキーマに対し `export type PostInput = z.infer<typeof postInputSchema>` 等を提供し、`database.types.ts` の対応する `Insert` 型・DB CHECK と矛盾しないことを担保する（矛盾検知の方法は NFR-213-04）。
- [ ] FR-213-04: 既存の個別検証を共有スキーマへ移行・統合する：
  - `src/lib/postValidation.ts` の `validatePost()` を `postInputSchema` で置換または内部実装を zod へ委譲し、呼び出し側（`src/hooks/useEditPost.ts:51`）の挙動（`{valid, error}` 返却・i18n）を維持する。
  - `src/lib/validation/password.ts` は**現状維持を許容**する（正規表現で完結し i18n キー連携済み、`validatePasswordStrength()` は REQ-152 で確立済みの単一ソース）。ただし配置を `src/lib/validation/` に揃える観点で、必要なら zod の `superRefine` で同等ポリシーを表現する選択肢を「任意」として記す（強制しない＝過剰移行を避ける）。
  - `src/app/api/og/route.tsx:10-23` の `sanitizeOgParams()` は**サニタイズ（切り詰め）＋許可リスト照合**であり検証とは性質が異なるため、原則現状維持。共有スキーマへ寄せる場合も「`.catch()` でフォールバック値を返す」挙動（不正入力でも 500 を返さず既定値で描画）を壊さないこと。
- [ ] FR-213-05: 各書き込み経路で、**insert / update の直前に対応 zod スキーマで `safeParse` を実行**し、失敗時は DB に投げずに i18n 化したエラーを返す。対象（最低限、検証が欠落／不整合の経路を優先）：`usePostForm.ts:296`（既存インライン検証を `postInputSchema` に置換）、`useOfflineQueue.ts:72`（同期前に検証＝改竄／古い下書きの防衛）、`ReportModal.tsx:47`（`reason` 列挙検証を追加）、`CommentSection.tsx:83`（長さ検証を追加）、`useSurveyRequests.ts:109`（reason 上限を 300 に修正）、`useSurveyRequestComments.ts:80`、`useSurveySites.ts:60`（欠落検証を追加）、`useProfile.ts:51`（欠落検証を追加）。
- [ ] FR-213-06: **多層防御の役割分担を明文化**する。`src/lib/validation/schemas.ts` の冒頭ドキュメントコメントに、(a) これらのクライアント zod 検証は **UX 向上と「第一の網」**であり、開発者ツール等で容易にバイパス可能であること、(b) ザリダスは **Server Actions / 書き込み API を持たない**ため zod はサーバー側の関所ではないこと、(c) **敵対的入力に対する最終的な信頼境界は DB**（CHECK 制約＝REQ-133／列保護トリガー＝REQ-208／列 REVOKE＝REQ-179／RLS）であること、を明記する。これは「クライアント検証＝防御」という誤認（現状の問題 4）を防ぐためのドキュメント要件である。
- [ ] FR-213-07: 検証ドリフトの恒久防止として、長さ上限・列挙値などの**マジックナンバー／リテラルを `src/lib/constants.ts` に集約**し、zod スキーマと（可能なら）DB 制約生成の双方が同一定数を参照できるようにする（`MAX_COMMENT_LENGTH=500`・`MAX_SURVEY_REASON_LENGTH=300`・`COUNT_MIN/MAX` 等は既存。未定数のもの＝`display_name` 1〜20、`bio` 100、`survey_site.name` 100 等を追加）。
- [ ] FR-213-08: i18n 方針を統一する。zod の検証失敗は **i18n キー**で表現し（`password.ts` の `messageKey` 方式に倣う）、呼び出し側で `t()` する。zod の `errorMap` もしくは各 `.refine(..., { message: '<i18n key>' })` でキーを返し、`src/locales/{ja,en,ko,zh}/translation.json` に対応キーを追加する（多言語対応の既存方針に整合）。

### 非機能要件

- [ ] NFR-213-01: zod 追加によるバンドル増を CI の **perf-budget ジョブ**（`.github/workflows/ci.yml:51-68`、`npm run size`＝`size-limit`）の各バジェット内に収める。特にホーム `/`（`.size-limit.json` で 10 KB gzip）・`/trends`（5 KB）等のページチャンクが超過しないこと。超過する場合は zod を**書き込みを伴うルートのみで動的 import** するか、`zod/mini`（または必要部分のみ）採用を検討し、トップレベルバンドルへの混入を避ける。zod は**書き込み（フォーム送信）コードパスでのみ必要**で、地図・一覧などの読み取り主体ルートには載せないこと。
- [ ] NFR-213-02: 既存の `npm run lint`（`eslint . --max-warnings 0`、`package.json:12`）・`npm run test`（vitest、`:13`）・`npm run schema:check`（`scripts/check-schema-types-sync.ts`、`:24`）がすべて通ること。
- [ ] NFR-213-03: 共有スキーマに対する単体テスト（vitest）を追加する。各スキーマについて (a) 正常値が通る、(b) 列挙外の値・上限超過・座標範囲外・空文字が**許可リストで弾かれる**ことを境界値で検証する。`src/lib/validation/__tests__/`（既存 `password.test.ts` と同じ場所）に配置する。
- [ ] NFR-213-04: **検証ドリフト検知**を仕組み化する。最低限、zod スキーマの長さ／列挙の定数が DB CHECK 制約値と一致することを、(a) 共通定数（FR-213-07）を両者が参照する設計、または (b) `schema:check` に類するテスト／スクリプトで確認する。少なくとも本 REQ で修正する reason 300 のような既知の不整合が再発しないテストを 1 本以上含める。
- [ ] NFR-213-05: 既存の DB 制約・RLS・トリガー（REQ-133 / REQ-179 / REQ-208 等）は**変更しない**。本 REQ はクライアント層の検証統一であり、最終防御である DB 側の挙動・テスト（pgTAP）に回帰を生じさせないこと。
