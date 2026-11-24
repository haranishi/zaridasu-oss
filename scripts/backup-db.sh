#!/usr/bin/env bash
# scripts/backup-db.sh
#
# REQ-217 (FR-217-01 / FR-217-02) — DB 論理バックアップの取得 + 暗号化。
#
# 本番 Postgres のロジカルダンプを取得し、保存前に age もしくは gpg で
# **公開鍵暗号**して `*.age` / `*.gpg` を出力する。秘密鍵は CI / リポジトリに
# 置かず、運用者ローカルでのみ復号する（NFR-217-01）。
#
# 平文ダンプ (*.sql) は暗号化後に削除し、アーティファクト / リポジトリに残さない。
#
# 使い方（ローカル手動・CI 共通）:
#   SUPABASE_DB_URL="postgres://...:6543/postgres" \
#   BACKUP_AGE_RECIPIENTS="age1xxxx..." \
#   ./scripts/backup-db.sh
#
# 環境変数:
#   SUPABASE_DB_URL          必須。本番 DB 接続文字列（pooler の 6543 / direct の 5432 どちらでも可）。
#                            SUPABASE_PROJECT_REF も未設定なら skip（exit 0）。値はログに出さない。
#   SUPABASE_PROJECT_REF     任意。単独設定時は SUPABASE_DB_URL の登録漏れとしてエラーにする。
#   BACKUP_DIR               出力先ディレクトリ（default: ./backups）。
#   BACKUP_AGE_RECIPIENTS    age の受信者公開鍵（カンマ区切り可 / `age1...` または ssh 公開鍵）。
#                            設定されていれば age で暗号化する（推奨）。
#   BACKUP_GPG_RECIPIENTS    gpg の受信者（メール / fingerprint・カンマ区切り可）。
#                            age が無く・本変数が設定されている場合に gpg で暗号化する。
#   BACKUP_PREFIX            出力ファイル名の接頭辞（default: zaridasu-db）。
#
# 標準出力: GitHub Actions の workflow command（::notice / ::warning / ::error）も併用。
# 終了コード:
#   0  : 成功 もしくは skip（DB 接続情報がすべて未設定）
#   1  : SUPABASE_DB_URL 未設定 / 暗号化に必要な受信鍵が無い / 暗号化失敗
#   2  : 依存コマンド不足・ダンプ失敗（内部エラー）
#
# ⚠ 秘密保持: SUPABASE_DB_URL / 鍵の実値は絶対に echo しない。set -x も使わない。
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-zaridasu-db}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASENAME="${BACKUP_PREFIX}-${TIMESTAMP}"

# ---- 必須変数ガード（未設定なら CI を壊さず skip）-------------------------
if [[ -z "${SUPABASE_DB_URL:-}" && -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "::notice::SUPABASE_DB_URL / SUPABASE_PROJECT_REF が未設定のため DB バックアップを skip します"
  exit 0
fi
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "::error::SUPABASE_PROJECT_REF だけでは DB バックアップを取得できません。SUPABASE_DB_URL（pg_dump 用の接続文字列）を GitHub Secrets に登録してください。"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
PLAIN_PATH="${BACKUP_DIR}/${BASENAME}.sql"

# 平文ダンプは何があっても消す（暗号化成功時も失敗時も）。
cleanup_plain() {
  if [[ -f "${PLAIN_PATH}" ]]; then
    # shred があれば上書き削除、無ければ通常 rm。
    if command -v shred >/dev/null 2>&1; then
      shred -u "${PLAIN_PATH}" 2>/dev/null || rm -f "${PLAIN_PATH}"
    else
      rm -f "${PLAIN_PATH}"
    fi
  fi
}
trap cleanup_plain EXIT

# ---- 1) ロジカルダンプの取得 ---------------------------------------------
echo "::group::DB dump (${BASENAME})"
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  # pg_dump 優先。無ければ supabase CLI の db dump にフォールバック。
  if command -v pg_dump >/dev/null 2>&1; then
    echo "pg_dump で取得します（接続文字列はログに出しません）"
    # --no-owner / --no-privileges: リストア先のロール差異を吸収（RLS/権限は migration で再構築）。
    pg_dump --no-owner --no-privileges --format=plain --file="${PLAIN_PATH}" "${SUPABASE_DB_URL}"
  elif command -v supabase >/dev/null 2>&1; then
    echo "pg_dump が無いため supabase db dump を使用します"
    supabase db dump --db-url "${SUPABASE_DB_URL}" -f "${PLAIN_PATH}"
  else
    echo "::error::pg_dump も supabase CLI も見つかりません"
    exit 2
  fi
fi

if [[ ! -s "${PLAIN_PATH}" ]]; then
  echo "::error::ダンプファイルが空です（取得失敗）"
  exit 2
fi
echo "ダンプ取得: ${PLAIN_PATH} ($(wc -c < "${PLAIN_PATH}") bytes)"
echo "::endgroup::"

# ---- 2) 暗号化（age 優先 / gpg フォールバック）----------------------------
# age と gpg の優先順位は「受信鍵が設定されているか」で決める。
ENC_PATH=""
if command -v age >/dev/null 2>&1 && [[ -n "${BACKUP_AGE_RECIPIENTS:-}" ]]; then
  ENC_PATH="${BACKUP_DIR}/${BASENAME}.sql.age"
  # カンマ区切りの受信者を -r で複数指定に展開する。
  age_args=()
  IFS=',' read -r -a _recips <<< "${BACKUP_AGE_RECIPIENTS}"
  for r in "${_recips[@]}"; do
    r="$(echo "${r}" | xargs)" # trim
    [[ -n "${r}" ]] && age_args+=( -r "${r}" )
  done
  echo "age で暗号化します（受信者 ${#age_args[@]}/2 件）"
  age "${age_args[@]}" -o "${ENC_PATH}" "${PLAIN_PATH}"
elif command -v gpg >/dev/null 2>&1 && [[ -n "${BACKUP_GPG_RECIPIENTS:-}" ]]; then
  ENC_PATH="${BACKUP_DIR}/${BASENAME}.sql.gpg"
  gpg_args=()
  IFS=',' read -r -a _recips <<< "${BACKUP_GPG_RECIPIENTS}"
  for r in "${_recips[@]}"; do
    r="$(echo "${r}" | xargs)"
    [[ -n "${r}" ]] && gpg_args+=( --recipient "${r}" )
  done
  echo "gpg で暗号化します"
  gpg --batch --yes --trust-model always "${gpg_args[@]}" \
    --output "${ENC_PATH}" --encrypt "${PLAIN_PATH}"
else
  echo "::error::暗号化できません。age を入れて BACKUP_AGE_RECIPIENTS を、または gpg + BACKUP_GPG_RECIPIENTS を設定してください。平文ダンプは保存せず破棄します（NFR-217-01）。"
  exit 1
fi

if [[ ! -s "${ENC_PATH}" ]]; then
  echo "::error::暗号化済みファイルが空です"
  exit 1
fi

# 整合確認用に SHA-256 を併記（リストア時に破損検知）。
if command -v sha256sum >/dev/null 2>&1; then
  ( cd "${BACKUP_DIR}" && sha256sum "$(basename "${ENC_PATH}")" > "$(basename "${ENC_PATH}").sha256" )
elif command -v shasum >/dev/null 2>&1; then
  ( cd "${BACKUP_DIR}" && shasum -a 256 "$(basename "${ENC_PATH}")" > "$(basename "${ENC_PATH}").sha256" )
fi

echo "::notice::DB バックアップ作成: ${ENC_PATH} ($(wc -c < "${ENC_PATH}") bytes)"

# GitHub Actions の後続ステップ（アップロード）へ出力名を渡す。
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "enc_path=${ENC_PATH}"
    echo "basename=${BASENAME}"
  } >> "${GITHUB_OUTPUT}"
fi

# 平文は trap cleanup_plain で破棄される。
exit 0
