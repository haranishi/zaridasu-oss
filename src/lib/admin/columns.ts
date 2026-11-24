/**
 * REQ-142: Admin 画面の posts 列指定を共通定数化する。
 *
 * `select('*')` を排して egress / メモリ / PII 漏洩リスクを抑制し、
 * 同時に CSV 出力と一覧で列リストを揃えるための共通モジュール。
 *
 * 関連: REQ-103（select-star 全廃）/ REQ-032（データ取得効率化）
 */

/**
 * `/admin/posts` 一覧で実際に画面に出している列。
 * - id / created_at: 行特定 & ソート / 日付表示
 * - lat / lng: 地図モーダル表示
 * - species / info_type / municipality / comment: メイン表示
 * - photos / audio_url / audio_duration_ms: プレビュー
 * - status / rejection_reason / rejection_message: ステータス & 却下情報
 * - is_anonymous / is_official / auto_approved: バッジ表示
 * - user_id: 削除/操作の所有者判定
 * - count / observed_at: 補助メタ
 * - weather / temperature / humidity: 天気表示
 * - ai_result: AIBadge / 判定詳細表示（重い JSONB だが現状必要）
 * - image_hashes / audio_hash: 重複チェック表示で参照される可能性
 * - ai_analyzed_at / ai_failure_count: AI 状態表示
 * - reviewed_at / reviewed_by: レビュー履歴表示（操作系で活用）
 * - is_flagged / survey_request_id: フラグ・調査依頼との関連表示
 */
// REQ-243: 生 lat/lng は列 GRANT で剥奪済み。一覧は粗化列 display_lat/lng を lat/lng へエイリアスして
// 概位置を表示し、location_disclosure を取得して公開レベル操作 UI に供給する。管理者が「正確」座標を
// 見る/出力する場合は get_admin_post_locations RPC 経由で上書きする（審査地図・CSV）。
export const ADMIN_POSTS_LIST_COLUMNS =
  'id, created_at, lat:display_lat, lng:display_lng, location_disclosure, species, info_type, municipality, comment, photos, audio_url, audio_duration_ms, status, rejection_reason, rejection_message, is_anonymous, is_official, auto_approved, user_id, count, observed_at, weather, temperature, humidity, ai_result, image_hashes, audio_hash, ai_analyzed_at, ai_failure_count, reviewed_at, reviewed_by, is_flagged, survey_request_id'

/**
 * `/admin/posts` の CSV 出力で参照している列。
 * 既存実装（AdminPostsPage.handleExportCSV）と一致させること。
 * REQ-243: lat/lng は display_* エイリアス（粗化）。CSV は get_admin_post_locations RPC で正確座標へ上書きする。
 */
export const ADMIN_POSTS_CSV_COLUMNS =
  'id, created_at, lat:display_lat, lng:display_lng, species, info_type, municipality, comment, photos, is_anonymous, status, rejection_reason, weather, temperature, humidity'
