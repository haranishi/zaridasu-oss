## 計測仕様書（tracking plan・テンプレ）

> 実装時にファイル:行と最終パラメータを確定して埋める。PII 列は「位置生値/メール/個人名/自由記述を含まない」を Yes/No で。CD = カスタムディメンション登録要否。

| イベント名 | 種別 | 発火箇所（ファイル:行） | 主要パラメータ（型/許容値） | PII無 | キーイベント | カウント | CD要 |
|---|---|---|---|---|---|---|---|
| `post_start` | カスタム | `HomeInteractive.tsx:190-193` | `entry: header\|bottom_nav\|survey_link` | Yes | – | – | 任意 |
| `post_media_attached` | カスタム | `usePostForm.ts:handleFileChange` | `photo_count:int, has_exif_gps:bool` | Yes | – | – | 任意 |
| `post_submit` | カスタム | `usePostForm.ts:submitPost`（insert 直前） | `species, info_type, has_photo, has_audio, survey_method` | Yes | – | – | 要 |
| `post_success` | カスタム | `usePostForm.ts:351` | （`post_submit` と同等） | Yes | **★** | イベントごと | 要 |
| `post_fail` | カスタム | `usePostForm.ts:352-373` | `reason: rate_limit\|upload\|validation\|unknown` | Yes | – | – | 任意 |
| `post_save_offline` | カスタム | `usePostForm.ts:411` | `photo_count:int` | Yes | – | – | 任意 |
| `like` | カスタム | `useLike.ts:89-90`（/`:84-85`） | `action: like\|unlike` | Yes | – | – | 任意 |
| `comment_post` | カスタム | `CommentSection.tsx:96` | `is_admin:bool` | Yes | – | – | 任意 |
| `report_submit` | カスタム | `ReportModal.tsx:53` | `reason: spam\|wrong_location\|inappropriate\|other` | Yes | – | – | 要 |
| `ai_identify_view` | カスタム | `DetailPage.tsx:358-430` | `species_match:bool, confidence_bucket: low\|mid\|high` | Yes | – | – | 要 |
| `map_interact` | カスタム | `HomeInteractive.tsx:218`（デバウンス） | `trigger: pan_zoom` | Yes | – | – | 任意 |
| `map_filter_bounds` | カスタム | `HomeInteractive.tsx:210` | `enabled:bool` | Yes | – | – | 任意 |
| `gallery_view` | カスタム | `HomeInteractive.tsx:329/304`（間引き） | `source: handle\|swipe` | Yes | – | – | 任意 |
| `search` | 推奨 | `FilterBar.tsx:79-82`（デバウンス） | `search_term:string`（縮退可） | 要検討 | – | – | 要 |
| `survey_request_start` | カスタム | `HomeInteractive.tsx:201-205` | `entry: header` | Yes | – | – | 任意 |
| `survey_request_submit` | カスタム/推奨 | `SurveyRequestForm.tsx:68` | `species, urgency` | Yes | **★** | イベントごと | 要 |
| `sign_up` | 推奨（既存・不変） | `AuthCallbackPage.tsx:54,65,77` | `method: email\|google` | Yes | **★** | イベントごと | 任意 |
| `login` | 推奨（既存・不変） | `AuthModal.tsx:131`/`AuthCallbackPage.tsx:65,77` | `method: email\|google` | Yes | – | – | 任意 |
| `sign_up_initiated` | カスタム（既存・不変） | `AuthModal.tsx:174` | `method, from?` | Yes | – | – | 任意 |
| `home_cta` | カスタム（2026-10-19追加） | `HomeHero.tsx`（副ボタン・ガイド・記録の使われ方のリンク） | `target: map\|guide\|about` | Yes | – | – | 任意 |
| `home_banner` | カスタム（2026-10-19追加） | `CampaignBanner.tsx` | `banner: fieldwork\|monitor\|research` | Yes | – | – | 任意 |
| `home_gap` | カスタム（2026-10-19追加） | `HomeHub.tsx`（まだ足りない記録のカード） | `gap: species\|absence\|area` | Yes | – | – | 任意 |
| `post_intent` | カスタム（2026-10-19追加） | `HomeHub.tsx`（未ログインで記録しようとしたとき） | `entry: home_hero\|home_gap\|header\|bottom_nav\|onboarding` | Yes | – | – | 任意 |

（★ = キーイベント化対象。`survey_request_submit` は推奨イベント `generate_lead` を併用するか単独キーイベント化するかを FR-232-05/08 で決定。）
