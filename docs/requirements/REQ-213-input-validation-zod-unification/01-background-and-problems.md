## 背景

ザリダス（Next.js 15 App Router / Supabase SSR / TypeScript）は **Server Actions を一切持たず**、クライアントから Supabase JS で `posts` / `reports` / `comments` / `survey_requests` / `survey_request_comments` / `survey_sites` / `user_profiles` などのテーブルへ直接 `insert` / `update` する設計である（`grep -rn "\.insert(\|\.update(" src` の結果＝後述の 8 経路）。このアーキテクチャでは、入力データがアプリのサーバーコードを経由せず DB に到達するため、「投入される値の検証」を担う層が次の 3 つに分断されている。

1. クライアント側の散在した個別検証（フック / コンポーネント内のインライン `if` 文、専用関数 `validatePost()`・`validatePasswordStrength()`・`sanitizeOgParams()`）
2. DB の CHECK 制約（`species IN (...)`、`char_length(comment) <= 500` など）
3. RLS ポリシー（`auth.uid() = user_id` 等の行レベル所有権・権限）と BEFORE トリガー（列固定）

このうち (1) は実装者ごとに書式・対象・上限値がバラバラで、宣言的な単一ソースが存在しない。型は `src/types/database.types.ts` の `Insert:` 型で表現されるが、**TypeScript の型注釈は実行時に強制されない**（コンパイル後は消える）ため、実行時の値検証としては機能しない。スキーマバリデーションライブラリ（zod / yup / joi / valibot 等）は現状未採用（`grep -rn "zod\|yup\|joi\|valibot" src package.json` でヒット 0 件）。

本 REQ は、Obsidian ノート **`03_Web_App_Security`** および **`10_Web_App_Security_Practical`** の「入力検証はサーバー側で必須・許可リスト方式・クライアント由来の入力は敵対的入力とみなす・フロント検証はあくまで補助」という原則を下敷きに、散在した入力検証を **zod スキーマ（許可リスト方式）で宣言的に一元化**し、型と検証を単一ソース化する。同時に、**「クライアント zod は容易にバイパス可能であり、本当の信頼境界は DB（CHECK / RLS / トリガー）である」**という多層防御の役割分担を明文化する。

> 重要な前提（差分）: ザリダスにはサーバー側で入力を受け取る関所（Server Action / API route の書き込み経路）が無い。したがって zod を「サーバー側の唯一の検証」に据えることはできない。zod の役割は **(a) 送信前のクライアント側検証（UX 向上＋第一の網）** と **(b) 共有スキーマによる型・検証の単一ソース化** に限定し、**敵対的入力に対する最終防御は既存の DB 制約（REQ-133 のコメント長 CHECK、REQ-208 / REQ-179 の列保護・RLS）が担う**、という設計を本 REQ で明示する。zod 導入は DB 制約を置き換えるものではなく、DB 制約を「正本」とした上でクライアント検証をそれに整合させる作業である。

## 現状の問題

（ファイルパス:行番号つき）

### 1. 入力検証が 3 つの個別実装に分散し、単一ソースが無い

- パスワード強度: `src/lib/validation/password.ts:23-32`（`validatePasswordStrength()`、正規表現ベース）。検証ディレクトリ `src/lib/validation/` に存在するのはこれのみ（`password.ts` 1 ファイル＋テスト）。
- 投稿（post）: `src/lib/postValidation.ts:21-65`（`validatePost()`）。コメント長・個体数範囲・緯度経度・種・情報種別を**許可リスト**で検証するが、**`src/lib/validation/` 配下ではなく** `src/lib/` 直下に置かれ、命名も別系統。
- OG 画像パラメータ: `src/app/api/og/route.tsx:10-23`（`sanitizeOgParams()`）。`slice()` による切り詰めと `SPECIES` 配列照合（許可リスト）。
- いずれも返り値の形（`{valid, error}` / `{valid, messageKey}` / sanitize 済みオブジェクト）も i18n の扱いもバラバラで、横断的な「入力スキーマ」という概念が存在しない。

### 2. 検証がフック / コンポーネントにインラインで重複し、対象も網羅されていない

書き込み経路（`insert` / `update`）は次の 8 箇所。各経路の検証の有無・粒度が不統一：

- `src/hooks/usePostForm.ts:296-339`（`posts` insert）。**手書きインライン検証**で座標範囲（`:248-252`）・コメント長 500（`:253-257`）・個体数（`:258-262`）を個別にチェック。`validatePost()` は**呼んでいない**（同等ロジックを再実装）。一方 `species` / `info_type` / `weather` / `survey_method` / `location_source` などの**列挙値はクライアントで検証せず**、DB CHECK 任せ。
- `src/hooks/useOfflineQueue.ts:72-95`（オフライン同期時の `posts` insert）。**入力検証は実質ゼロ**（IndexedDB の下書きをそのまま投入）。`usePostForm` の検証を通っていない古い下書きや改竄された下書きが直接 insert され得る。
- `src/components/modals/ReportModal.tsx:47-51`（`reports` insert）。`reason` の必須チェック（`:40-43`）はあるが、`reason` が許可リスト（`spam|wrong_location|inappropriate|other`）に含まれるかの**クライアント検証は無い**（`<input type=radio>` の値のみ。DB CHECK 任せ）。`comment` は `maxLength={300}`（`:124`、UI 属性のみ＝開発者ツールで回避可能）。
- `src/components/features/posts/CommentSection.tsx:83-92`（`comments` insert）。`content.trim()` の空判定（`:78`）のみで、**長さ上限（DB は 500）のクライアント検証が無い**。
- `src/hooks/useSurveyRequests.ts:109-119`（`survey_requests` insert）。座標範囲（`:102-105`）と `reason` 長 500（`:106-108`）をインライン検証するが、**DB CHECK は `char_length(reason) BETWEEN 1 AND 300`**（`supabase/schema.sql:1195`）。**クライアント上限 500 と DB 上限 300 が食い違い**、301〜500 字はクライアントを通過して DB で `23514`（check_violation）になる（UX 不良＋検証ドリフト）。`urgency` の列挙検証も無し。
- `src/hooks/useSurveyRequestComments.ts:74-87`（`survey_request_comments` insert）。`trimmed` 空判定＋長さ 500 はインラインで持つが（`:78-79`）、DB CHECK は `char_length(body) BETWEEN 1 AND 500`（`supabase/migrations/20260425000005_survey_request_comments.sql:8`）で**たまたま一致**しているだけ。定数化されておらず将来ドリフトしうる。
- `src/hooks/useSurveySites.ts:58-68`（`survey_sites` insert）。`{ ...site, user_id }` を**素通しで insert**。`name`（DB は `BETWEEN 1 AND 100`、`schema.sql:1449`）・`notes`（`<= 500`、`schema.sql:1454`）・座標・`species` のクライアント検証は**一切無い**。
- `src/hooks/useProfile.ts:51-58`（`user_profiles` update）。`updates`（`Partial<Profile>`）を**無検証で update**。`display_name`（DB は `BETWEEN 1 AND 20`、`schema.sql:1098`）・`bio`（`<= 100`、`schema.sql:1100`）のクライアント検証が無く、超過は DB CHECK 任せ。
- 管理画面（`src/views/admin/AdminPostsPage.tsx:135,156,243,323` ほか）の `update` も同様にインライン。

### 3. 型注釈は実行時検証にならない（型と検証の二重管理）

- `src/types/database.types.ts` の各 `Insert:` 型（`:28,68,87,105,127` ほか）は「どの列に何を入れるか」を**コンパイル時のみ**保証する。実行時にユーザー入力が型どおりかは**一切検証されない**。
- そのため「型（database.types.ts）」と「実行時検証（個別の if 文）」が別々に保守され、片方を変えてももう片方が追従しない（例: 上記 2 の reason 上限 500 vs 300 のような不整合の温床）。

### 4. クライアント検証が「防御」と誤認されるリスク（信頼境界の不明確さ）

- 既存コードには「クライアント検証は UX のみ。実防御は DB」という意識が**部分的にしか明文化されていない**。明文化されている好例: `usePostForm.ts:189-191`（spam 制限の localStorage チェックは UX 最適化のみで実防御は DB トリガー `check_post_rate_limit`）、`useSurveyRequests.ts:84`（`owner='me'` フィルタの真の防衛線は RLS）。
- 一方、上記の入力長・列挙検証については「これはバイパス可能だから DB CHECK が本当の防御」という整理が**スキーマ層として一元化されていない**。zod を導入する際、これを誤って「サーバー側検証」と位置づけると、サーバー関所が無いザリダスでは**実防御の幻想**を生む。

### 5. 影響評価（現時点の実害）

- 上記の多くは **DB の CHECK 制約と RLS が最終防御として機能している**ため、不正値・長すぎる値・他人 user_id での insert は **DB で `23514`（check_violation）/ `42501`（RLS 違反）として拒否され、データ汚染や権限昇格は発生しない**（＝多層防御が効いている）。
- したがって本 REQ は緊急の脆弱性修正ではなく、**(a) 検証ドリフト（reason 500/300）の解消、(b) クライアント検証の網羅と UX 改善（DB エラーになる前に分かりやすく弾く）、(c) 型・検証の単一ソース化、(d) 信頼境界の明文化**を目的とする堅牢化・整理である。`useSurveySites` / `useProfile` のように**クライアント検証が完全欠落**している経路は、DB エラーメッセージがそのままユーザーに露出する UX 不良があり、優先的に整える価値がある。
