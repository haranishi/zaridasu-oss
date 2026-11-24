import type { Json } from '../../../src/types/database.types'
import { TEST_ADMIN, TEST_MEMBER } from './admin-auth.mjs'

const date = '2026-10-08T10:30:00+09:00'
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// Wire contracts come from get_audit_logs SQL, including nullable login_failed IDs.
export interface AuditLogFixture {
  id: string
  created_at: string
  admin_id: string | null
  admin_email: string | null
  action: string
  target_type: string
  target_id: string | null
  details: Json
  total_count?: number
}

export const AUDIT_LOGS: AuditLogFixture[] = Array.from({ length: 23 }, (_, i) => ({
  id: uuid(i + 1), created_at: date, admin_id: TEST_ADMIN.id,
  admin_email: TEST_ADMIN.email, action: 'delete_post', target_type: 'post',
  target_id: uuid(100 + i), details: { reason: `fixture-${i}` },
}))
AUDIT_LOGS[0] = {
  id: uuid(1), created_at: date, admin_id: null, admin_email: null,
  action: 'login_failed', target_type: 'user', target_id: null,
  details: { reason: 'invalid_credentials', attempt_count: 2 },
}
AUDIT_LOGS[1] = { ...AUDIT_LOGS[0]!, id: uuid(2), admin_id: TEST_ADMIN.id, action: 'delete_post', target_type: 'post', target_id: uuid(101), details: null }
AUDIT_LOGS[2] = { ...AUDIT_LOGS[1]!, id: uuid(3), action: 'approve_post', details: { payload: { toString: null }, list: [1, null, { value: 'nested' }], note: 'comma, "quote"\nline' } }
AUDIT_LOGS[3] = { ...AUDIT_LOGS[1]!, id: uuid(4), action: 'trigger_status_change', details: [true, 'array', null] }
AUDIT_LOGS[4] = { ...AUDIT_LOGS[1]!, id: uuid(5), details: 'scalar-json' }
AUDIT_LOGS[5] = { ...AUDIT_LOGS[1]!, id: uuid(6), details: false }

export const ADMIN_USERS = [
  { id: TEST_ADMIN.id, email: TEST_ADMIN.email, created_at: date, last_sign_in_at: date, is_admin: true },
  { id: TEST_MEMBER.id, email: TEST_MEMBER.email, created_at: date, last_sign_in_at: null, is_admin: false },
  // auth.users may contain phone-only identities and no app_metadata.role.
  { id: uuid(900), email: null, created_at: date, last_sign_in_at: null, is_admin: null },
]

export const POSTS = [{
  id: uuid(200), created_at: date, lat: null, lng: null, location_disclosure: 'hidden',
  species: 'american', info_type: 'sighting', municipality: null,
  comment: 'E2E投稿表示', photos: null, audio_url: null, audio_duration_ms: null,
  status: 'pending', rejection_reason: null, rejection_message: null,
  is_anonymous: false, is_official: false, auto_approved: false, user_id: TEST_MEMBER.id,
  count: null, observed_at: null, weather: null, temperature: null, humidity: null,
  ai_result: null, image_hashes: null, audio_hash: null, ai_analyzed_at: null,
  ai_failure_count: 0, reviewed_at: null, reviewed_by: null, is_flagged: false, survey_request_id: null,
}]
export const IRREGULAR_AI_RESULT: Json = {
  detected_species: 'american', notes: { reason: 'historic object' }, confidence: '0.9',
  image_quality: ['good'], concerns: ['low_quality', null, {}],
  per_photo: [null, { confidence: { nested: true }, species_match: [] }],
}

export const REPORTS = [{
  id: uuid(300), post_id: uuid(200), reason: 'other', comment: null,
  reporter_ip: null, resolved: false, created_at: date, posts: null,
}]
export const COMMENTS = [{
  id: uuid(400), content: 'E2Eコメント表示', created_at: date,
  is_admin: false, user_id: null, post_id: uuid(200), posts: null,
}]
export const PRIVATE_SPOTS = [{
  id: uuid(500), user_id: TEST_MEMBER.id, name: 'E2E非公開スポット', note: null,
  lat: 39.72, lng: 140.1, accuracy: null, recorded_at: date, created_at: date,
}]
export const RARE_PATH = `${TEST_MEMBER.id}/${uuid(601)}.jpg`
export const RARE_SIGHTINGS = [{
  id: uuid(600), client_id: uuid(602), user_id: TEST_MEMBER.id, stop_id: null,
  species_key: 'other', species_label: 'E2E希少種', count: null, note: null,
  lat: 39.72, lng: 140.1, accuracy: null, location_source: 'map',
  observed_at: date, photo_paths: [RARE_PATH], created_at: date,
}]

export const RPC_DATA: Record<string, Json> = {
  get_admin_user_list: ADMIN_USERS,
  get_user_activity: { post_count: 1, comment_count: 1, report_count: 0, recent_posts: [], recent_comments: [] },
  get_admin_post_stats: {
    species_counts: [{ species: 'american', count: 1 }],
    info_type_counts: [{ info_type: 'sighting', count: 1 }],
    municipality_counts: [], monthly: [{ month: '2026-10-01', count: 1 }],
  },
  get_ai_cost_summary: {
    period_days: 30, total_calls: 1, total_input_tokens: 100, total_output_tokens: 20,
    by_function: { 'analyze-image': { calls: 1, input_tokens: 100, output_tokens: 20 } },
    by_model: null, daily: [{ date: '2026-10-08', calls: 1, input_tokens: 100, output_tokens: 20 }],
  },
  get_experiment_metrics: ['control', 'treatment'].flatMap(variant => ['pre', 'post'].map(period => ({
    variant, period, post_count: 1, n_users: 1, photo_rate: 0, gps_rate: 0,
    accuracy_median: null, repeat_rate: 0,
  }))),
  get_kpi_summary: {
    accuracy_threshold_m: 100, nsm: { label: '有効投稿', value: 1, prev: 0, wow: null, delta: 1 },
    guardrails: { rejection_rate: null, completeness_rate: 0, accuracy_rate: null, posts_this_week: 1 },
    kgi: { cumulative_approved: 1, repeat_contributors: 0 },
  },
  get_kpi_quality_funnel: {
    accuracy_threshold_m: 100,
    funnel: { completed: 1, approved: 1, pending: 0, rejected: 0, approval_rate: 1, rejection_rate: 0 },
    completeness: { count: 1, complete: 0, rate: 0, photo_rate: 0, accuracy_present_rate: 0 },
    accuracy: { count: 1, within_threshold: 0, rate_of_all: 0, rate_of_measured: null, measured: 0 },
    cost_per_submission: { approved: 1, ai_calls: 1, input_tokens: 100, output_tokens: 20, tokens_per_approved: 120 },
  },
  get_retention_cohorts: { max_months: 6, cohorts: [{ cohort: '2026-10-01', size: 1, retention: [{ m: 0, users: 1, rate: 1 }, { m: 1, users: 0, rate: null }] }] },
  get_ai_accuracy_stats: {
    bins: [{ key: 'lt50', min: 0, max: 50, total: 1, approved: 0, rejected: 0, pending: 1, auto_approved: 0, approval_rate: null, match_rate: null }],
    summary: { total: 1, approved: 0, rejected: 0, pending: 1, auto_approved: 0, approval_rate: null, match_rate: null, avg_confidence: null,
      human_reviewed: { count: 0, approved: 0, rejected: 0, match_rate: null } },
  },
}
