## 受入条件
- [ ] AC-01: Gemini が `confidence` を範囲外（例 `1.5` / 文字列）/ `detected_species` を未定義コード / `is_appropriate` を欠落で返したとき、受信後検証で正規化され、**不正値が `ai_result` に保存されず、自動承認にも進まない**（単体テストで確認）。
- [ ] AC-02: `is_appropriate` が `true` 以外（欠落/`null`/非 boolean）の場合に **`auto_approved` が立たず手動レビューへ回る**。`is_appropriate === false` は従来どおり自動却下される。
- [ ] AC-03: `concerns` が enum 配列に固定され、Gemini が enum 外の自由文を返しても**保存・表示時に除去**される。`notes` は単一の上限・サニタイズ（改行/制御文字除去）を通って保存される。
- [ ] AC-04: 承認済み投稿の詳細ページで、**第三者（非所有者）に Gemini 生成の自由文 `notes` が無害化されずに表示されない**（FR-215-04 の方針どおり enum 由来文言 or 本人/admin 限定になっている）。
- [ ] AC-05: `record.species`（申告種）に指示文を含む任意文字列を入れても、**許可リスト照合で正規化されてからプロンプトに入り、システムプロンプトの「指示無視」注記により判定が誘導されない**（範囲外 species は固定文言になることをテストで確認）。
- [ ] AC-06: `reanalysis=true` での呼び出し時、client が `record.species` / `record.photos` 等を改竄しても、**プロンプト・判定には DB から再取得した値が使われる**（client は post id のみ信頼される）。
- [ ] AC-07: 自動承認/却下の閾値を env で安全側下限未満に設定しても、**コード側下限でクランプ**され「ほぼ全件自動承認」に倒れない。直近ウィンドウで auto-approve 率/AI 呼び出し頻度が異常閾値を超えたとき、`admin_alerts` 記録＋通知が発火する（redaction 適用済み）。
- [ ] AC-08: 上限バイト数を超える画像/音声は **Gemini を呼ばずに skip / error 記録され**、手動レビューへ回る（コスト/メモリ暴走しない）。
- [ ] AC-09: 全変更後に Deno / TypeScript の型チェックと既存・新規テストが通り、ログ/通知に鍵が露出しないことを確認する（NFR-215-02/03）。

## 影響範囲
- `supabase/functions/_shared/`（新規 `aiSchema.ts`（受信後検証）、`aiLogging.ts` の redaction 依存維持、必要なら共通サニタイズ/閾値クランプ）
- `supabase/functions/analyze-image/index.ts`（受信後検証・`is_appropriate` フェイルセーフ・`concerns` enum・`notes` 統一・プロンプト無害化・reanalysis 信頼境界・送信前サイズガード・閾値クランプ）
- `supabase/functions/analyze-audio/index.ts`（同上の音声側 + `combineDecision`）
- `supabase/functions/notify-gemini-key-failure/index.ts`（参照: 通知パターン踏襲）/ 新規 `notify-ai-anomaly`（FR-215-07）またはその拡張
- `src/views/DetailPage.tsx`・`src/components/features/dashboard/MyPostsSection.tsx`・`src/components/features/admin/ReviewCardAI.tsx`・`src/components/features/admin/AIBadge.tsx`（AI 自由文の表示対象・enum 化整合）
- `src/hooks/useEditPost.ts`・`src/views/admin/AdminPostsPage.tsx`（reanalysis 呼び出しが post id 中心になることの整合。本体は Edge 側で担保）
- `src/types/post.ts`（`concerns` enum 化・型の整合）
- `.env.example`（新規 `AI_MAX_IMAGE_BYTES` / `AI_MAX_AUDIO_BYTES` 等の変数名追記。値は記載しない）
- `supabase/functions/_shared/__tests__/`・`analyze-image/__tests__`・`analyze-audio/__tests__`（検証/無害化/閾値テスト）

## 優先度
- **緊急度**: Medium〜High / **重要度**: High / **理由**: ザリダスは「ユーザー投稿を AI が自動判定し、人手レビュー無しで承認/却下する」点が設計の肝であり、AI 出力の無検証信用（特に `is_appropriate` のフェイルオープン、`confidence`/`detected_species` 未検証）とプロンプトインジェクション（`record.species` 混入・画像内テキスト誘導）は、**不適切コンテンツの自動公開・誤承認の権威化**という公開面の実害に直結する。一方で鍵はサーバー専用に保たれ、DOM XSS は React により成立せず、新規投稿経路は webhook secret で守られているため、即時の致命性は限定的。受信後検証・フェイルセーフ化・プロンプト無害化はいずれも局所的・低コストで実装でき、市民科学データの信頼性（誤った自動承認の防止）と濫用耐性を底上げする中核的堅牢化として優先度は高い。
