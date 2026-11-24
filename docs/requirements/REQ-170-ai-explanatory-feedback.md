# REQ-170: 説明付きAIフィードバックループ（投稿者向け教育的フィードバックカード）

## 背景
Notion 先行研究レビュー「市民科学PF『ザリダス』RQ1/H2」のサブテーマ2に基づく最重要施策である。van der Wal et al. (2016) は、市民科学プラットフォームにおいて「単なる正誤判定」ではなく「なぜその同定になったか・どう改善できるか」を伴う**説明付き自動フィードバック**を投稿者本人に返すと、同定精度と短期リテンション（学習内容の保持）が有意に向上することを示した。

本プロジェクトの卒研仮説 **H2「フィードバック導入でリピート投稿率が向上する」** は、このサブテーマ2の検証に直結する。現状の AI 判定は「結果の提示」にとどまり、投稿者の学習・内発的動機づけにつながる**教育的な説明**を返していない。H2 を検証するには、投稿者本人に対して「判定根拠・写真の質・次回どう撮れば精度が上がるか」を肯定的トーンで提示するフィードバックループを実装する必要がある。

## 現状の問題
AI 解析（Gemini）は実装済みだが、出力は管理者レビューと最小限の結果表示に偏っており、投稿者へ返す**説明型・教育型のフィードバックUIが存在しない**。

- `supabase/functions/analyze-image/index.ts:294-318`（`IMAGE_RESPONSE_SCHEMA`）: 出力フィールドは `detected_species` / `species_match` / `confidence` / `image_quality` / `is_appropriate` / `concerns` / `notes` のみ。`notes` は「日本語30文字以内」（`index.ts:322-340` の `IMAGE_SYSTEM_PROMPT`）に強制されており、**判定根拠の説明・撮影改善アドバイスを返すフィールドが無い**。
- `src/views/DetailPage.tsx:358-444`（AI判定カード）:
  - `ai.error` の場合 `return null`（`DetailPage.tsx:367`）で**何も表示しない**。誤同定・解析失敗時に投稿者へ説明が届かない。
  - 表示は検出種・一致/不一致・信頼度バー・画質・`notes`（`DetailPage.tsx:408-410`）のみ。**「なぜ違うと判断したか」「次回どう撮るべきか」が無い**。
  - このカードは閲覧者全員に同一表示で、`isOwner`（`DetailPage.tsx:154`）による**投稿者本人向けの教育的トーン分岐が無い**。
- `src/components/features/admin/AIBadge.tsx:79-128`: AI 結果の詳細は**管理者ポップオーバー専用**。投稿者には届かない。
- `posts.ai_result` カラム（型は `src/types/post.ts:63-78` の `AIResult`、`src/types/database.types.ts:10-58` の posts.Row には未記載で `PostExtendedFields` 側に定義）に、撮影アドバイス・判定根拠を保持する構造が無い。
- i18n: 投稿詳細の AI 文言は `src/locales/ja/translation.json:252-269`（`detail.aiJudgment` 〜 `detail.aiQualityPoor`）に定義され、en/ko/zh にも対応キーが存在するが、**フィードバック説明・アドバイス用のキー群が未定義**。

## 目的
投稿直後または AI 解析完了後に、**投稿者本人**に対して対象種（アメリカザリガニ/ウシガエル）の判定根拠・確信度・撮影改善アドバイスを日本語（i18n: ja/en/ko/zh）で提示する**説明付きフィードバックカード**を実装し、H2（リピート投稿率向上）の検証を可能にする。誤同定・低品質時も投稿者を責めず、内発的動機を損なわない肯定的トーンで「次回どう撮ると精度が上がるか」を教育的に伝える。

## 要件

### 機能要件
- [ ] FR-170-01: `supabase/functions/analyze-image/index.ts` の `IMAGE_RESPONSE_SCHEMA` と `IMAGE_SYSTEM_PROMPT` に、投稿者向けフィードバック用フィールドを追加する。最低限 `improvement_advice`（撮影改善アドバイス: 角度・距離・明るさ・ピント等のキーワード enum 配列）と、誤同定理由を示す `mismatch_reason`（種不一致と判定した根拠、判別不能時は null）を含める。トークン肥大を避けるため、enum コードや短い構造化値を優先し、自由文は最小限にとどめる。
- [ ] FR-170-02: 改善アドバイスは i18n でフロント側文言に変換する設計とする。Gemini からは言語非依存のコード（例: `angle`, `distance`, `lighting`, `focus`, `closer`, `whole_body`）を返させ、`src/locales/*/translation.json` の `detail.aiAdvice.*` キーで各言語の文言にマッピングする（モデルに各言語の長文を生成させない）。
- [ ] FR-170-03: `src/views/DetailPage.tsx` の AI 判定カードを、投稿者本人（`isOwner === true`）に対して**説明付きフィードバックカード**として拡張する。判定根拠（検出種＋一致/不一致＋確信度）に加え、(a) 一致時は「次回さらに精度を上げる撮影アドバイス」、(b) 不一致時は「なぜ違うと判断したか（`mismatch_reason`）＋撮り直しアドバイス」、(c) 低品質/失敗時は「具体的な改善アドバイス」を肯定的トーンで表示する。
- [ ] FR-170-04: `DetailPage.tsx:367` の `if (ai.error) return null` を投稿者本人に限り見直し、解析失敗時も「写真がうまく認識できませんでした。次回は〜」のような前向きなガイダンスを表示する（閲覧者一般には従来どおり非表示でよい）。
- [ ] FR-170-05: フィードバック文言は誤同定でもユーザーを責めない肯定的トーンとする（例: 「惜しい！」「次回はこう撮ると精度が上がります」）。否定的・断定的表現（「間違っています」「失敗」等）を投稿者向けカードでは使用しない。
- [ ] FR-170-06: フィードバックカードの全文言を i18n 化し、`src/locales/ja|en|ko|zh/translation.json` の `detail.aiAdvice.*`（および説明見出し等）に4言語すべて追加する。
- [ ] FR-170-07: AI 解析がまだ完了していない投稿では、従来の「判定中…」（`detail.aiJudging`）表示を維持し、完了後にフィードバックカードへ自動的に切り替わる（再読込で反映で可）。

### 非機能要件
- [ ] NFR-170-01: フィードバック用フィールド追加による Gemini 出力トークン増は最小限に抑える。`improvement_advice` は enum コードの配列（最大3要素程度）とし、`notes` の既存上限方針（MAX_TOKENS 起因 truncate 抑止, `index.ts:46-47`/`322` 参照）を維持・悪化させない。
- [ ] NFR-170-02: 投稿者向けの詳細フィードバック（判定根拠・アドバイス）は `isOwner` のときのみ表示し、第三者には従来の参考情報レベルにとどめる（投稿者のプライバシー・誤同定情報の不要な拡散を防ぐ）。
- [ ] NFR-170-03: アドバイス用 i18n キーは欠落時にコード文字列がそのまま露出しないようフォールバック（未定義コードは非表示）を設ける。
- [ ] NFR-170-04: 追加フィールドは `posts.ai_result`（JSON）内に格納し、既存レコード（フィールド欠落）でもカードが壊れない後方互換を保つ。

## 受入条件
- [ ] AC-01: 投稿者本人がログイン状態で自分の投稿詳細を開くと、検出種・一致/不一致・確信度に加えて「次回の撮影アドバイス」が表示される。
- [ ] AC-02: 申告種と AI 判定が不一致（`species_match === false`）の自分の投稿で、投稿者には「なぜ違うと判断したか」の説明と撮り直しアドバイスが肯定的トーンで表示される。
- [ ] AC-03: 解析が失敗（`ai.error` あり）した自分の投稿でも、投稿者本人には前向きなガイダンス文言が表示される（従来は何も表示されなかった）。
- [ ] AC-04: 投稿者でない第三者が同じ投稿を開いても、詳細な撮影アドバイス・誤同定理由は表示されない（従来どおりの参考情報のみ）。
- [ ] AC-05: 言語を ja/en/ko/zh に切り替えても、フィードバックカードの全文言が翻訳済みで表示され、未翻訳キーやコード文字列が露出しない。
- [ ] AC-06: `analyze-image` の出力 JSON に `improvement_advice`（および不一致時の `mismatch_reason`）が含まれ、`posts.ai_result` に保存される。既存（追加前）の `ai_result` レコードを持つ投稿でもカードがエラーにならず表示される。

## 影響範囲
- `supabase/functions/analyze-image/index.ts`（`IMAGE_RESPONSE_SCHEMA` / `IMAGE_SYSTEM_PROMPT` / 結果集約に新フィールド追加）
- `supabase/functions/analyze-audio/index.ts`（音声判定にも同等のアドバイス概念を任意適用、最低限スキーマ整合）
- `src/types/post.ts`（`AIResult` / `AIAudioAnalysis` に `improvement_advice` / `mismatch_reason` を追加）
- `src/views/DetailPage.tsx`（AI 判定カードを投稿者向けフィードバックカードへ拡張、`isOwner` 分岐、error 時のガイダンス）
- `src/locales/ja/translation.json` ほか en/ko/zh（`detail.aiAdvice.*` 等の文言追加）
- （任意）`src/components/features/admin/AIBadge.tsx`（新フィールドの管理者向け表示）

## 優先度
- **緊急度**: High / **重要度**: High / **理由**: 卒研仮説 H2（フィードバック導入でリピート投稿率向上）の検証に直結する最重要施策であり、van der Wal et al. (2016) の知見に基づく RQ1/H2 サブテーマ2の中核。AI 解析基盤は既存のため追加コストは限定的だが、投稿者への教育的フィードバックが欠落している現状ギャップは研究目的の達成を妨げている。
