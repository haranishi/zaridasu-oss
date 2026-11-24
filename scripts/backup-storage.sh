#!/usr/bin/env bash
# scripts/backup-storage.sh
#
# REQ-217 (FR-217-03 / FR-217-02) — Storage バケットの実体ファイルをエクスポート + 暗号化。
#
# pg_dump / supabase db dump は Storage オブジェクトのバイナリを含まない。
# 写真 (post-photos) / 音声 (post-audio) の実体を別途取得しないと
# 「DB だけ戻しても posts の URL が切れる」状態になる（FR-217-03 の解消対象）。
# 非公開の写真置き場 (rare-photos = 希少種の記録 / water-report-photos = 水域情報の提供) も対象に含める。
# 記録を戻しても写真が戻らない状態を防ぐ（security-hardening 要件11）。
#
# 手段はサービスロールキーを用いた S3 互換 API でのミラー。Storage の S3 互換
# エンドポイント（`https://<ref>.supabase.co/storage/v1/s3`）に対し、
# aws CLI または rclone でバケットを丸ごと同期する。取得後 tar+暗号化して保管する。
#
# 使い方:
#   SUPABASE_PROJECT_REF=edxmkqmjzbarjdgnkcvc \
#   SUPABASE_STORAGE_S3_ACCESS_KEY=... \
#   SUPABASE_STORAGE_S3_SECRET_KEY=... \
#   SUPABASE_STORAGE_S3_REGION=ap-northeast-1 \
#   BACKUP_AGE_RECIPIENTS="age1xxxx..." \
#   ./scripts/backup-storage.sh
#
# 環境変数:
#   SUPABASE_PROJECT_REF             必須。S3 エンドポイント URL の組み立てに使用。未設定なら skip。
#   SUPABASE_STORAGE_S3_ENDPOINT     任意。明示する場合の S3 互換エンドポイント URL。
#                                    未指定なら https://<ref>.supabase.co/storage/v1/s3 を使う。
#   SUPABASE_STORAGE_S3_ACCESS_KEY   必須。Dashboard → Storage → S3 Connection で発行する access key。
#   SUPABASE_STORAGE_S3_SECRET_KEY   必須。同 secret key。未設定なら skip（CI を壊さない）。
#   SUPABASE_STORAGE_S3_REGION       任意。default: ap-northeast-1（プロジェクトのリージョンに合わせる）。
#   STORAGE_BUCKETS                  任意。対象バケット（スペース区切り）。default: "post-photos post-audio rare-photos water-report-photos"。
#                                    後ろ 2 つは非公開（希少種の写真・水域情報の写真）。復元できる元が他に無いので外さない。
#   BACKUP_DIR                       出力先（default: ./backups）。
#   BACKUP_PREFIX                    接頭辞（default: zaridasu-storage）。
#   BACKUP_AGE_RECIPIENTS            age 受信者公開鍵（カンマ区切り）。あれば age で暗号化。
#   BACKUP_GPG_RECIPIENTS            gpg 受信者。age が無い場合のフォールバック。
#
# 終了コード:
#   0  : 成功 もしくは skip
#   1  : 暗号化に必要な受信鍵が無い / 暗号化失敗
#   2  : 依存コマンド不足・同期失敗
#
# ⚠ 秘密保持: アクセスキー / シークレット / 鍵の実値は echo しない。set -x も使わない。
set -euo pipefail
# 作るファイルは本人だけが読める（平文の写真が入る tar を、他の利用者が読める形で作らない）
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-zaridasu-storage}"
STORAGE_BUCKETS="${STORAGE_BUCKETS:-post-photos post-audio rare-photos water-report-photos}"
S3_REGION="${SUPABASE_STORAGE_S3_REGION:-ap-northeast-1}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASENAME="${BACKUP_PREFIX}-${TIMESTAMP}"

# ---- 必須変数ガード -------------------------------------------------------
if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "::notice::SUPABASE_PROJECT_REF が未設定のため Storage バックアップを skip します"
  exit 0
fi
if [[ -z "${SUPABASE_STORAGE_S3_ACCESS_KEY:-}" || -z "${SUPABASE_STORAGE_S3_SECRET_KEY:-}" ]]; then
  echo "::notice::Storage S3 接続情報（access/secret key）が未設定のため Storage バックアップを skip します"
  exit 0
fi

S3_ENDPOINT="${SUPABASE_STORAGE_S3_ENDPOINT:-https://${SUPABASE_PROJECT_REF}.supabase.co/storage/v1/s3}"

mkdir -p "${BACKUP_DIR}"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/zaridasu-storage.XXXXXX")"
DUMP_ROOT="${WORKDIR}/${BASENAME}"
mkdir -p "${DUMP_ROOT}"

cleanup() {
  rm -rf "${WORKDIR}" 2>/dev/null || true
}
trap cleanup EXIT

# ---- 1) バケットを S3 互換 API でミラー -----------------------------------
echo "::group::Storage export (${BASENAME})"
echo "endpoint=${S3_ENDPOINT} region=${S3_REGION} buckets=[${STORAGE_BUCKETS}]"

sync_with_aws() {
  # AWS CLI 経路。認証は env var で渡す（履歴/ログに残さない）。
  export AWS_ACCESS_KEY_ID="${SUPABASE_STORAGE_S3_ACCESS_KEY}"
  export AWS_SECRET_ACCESS_KEY="${SUPABASE_STORAGE_S3_SECRET_KEY}"
  export AWS_DEFAULT_REGION="${S3_REGION}"
  local bucket dest
  for bucket in ${STORAGE_BUCKETS}; do
    dest="${DUMP_ROOT}/${bucket}"
    mkdir -p "${dest}"
    echo "  - aws s3 sync ${bucket} -> ${dest}"
    aws s3 sync "s3://${bucket}" "${dest}" \
      --endpoint-url "${S3_ENDPOINT}" \
      --no-progress
  done
}

sync_with_rclone() {
  # rclone 経路（aws CLI が無い場合）。config はコマンドラインで完結させる。
  local bucket dest
  for bucket in ${STORAGE_BUCKETS}; do
    dest="${DUMP_ROOT}/${bucket}"
    mkdir -p "${dest}"
    echo "  - rclone copy ${bucket} -> ${dest}"
    rclone copy ":s3:${bucket}" "${dest}" \
      --s3-provider Other \
      --s3-endpoint "${S3_ENDPOINT}" \
      --s3-region "${S3_REGION}" \
      --s3-access-key-id "${SUPABASE_STORAGE_S3_ACCESS_KEY}" \
      --s3-secret-access-key "${SUPABASE_STORAGE_S3_SECRET_KEY}" \
      --s3-force-path-style \
      --transfers 8
  done
}

if command -v aws >/dev/null 2>&1; then
  sync_with_aws
elif command -v rclone >/dev/null 2>&1; then
  sync_with_rclone
else
  echo "::error::aws CLI も rclone も見つかりません。どちらかを導入してください。"
  exit 2
fi

file_count="$(find "${DUMP_ROOT}" -type f | wc -l | tr -d ' ')"
echo "取得ファイル数: ${file_count}"
echo "::endgroup::"

# ---- 2) tar 化 ------------------------------------------------------------
# 平文の tar は作業フォルダの中に作る。暗号化の途中で失敗しても、終了時の cleanup（trap）で必ず消える
# （以前は BACKUP_DIR に作っていたため、age / gpg が失敗すると平文の写真入り tar が残った）。
TAR_PATH="${WORKDIR}/${BASENAME}.tar.gz"
# WORKDIR を基準にして相対パスで固める（リストア時の展開を素直にする）。
tar -C "${WORKDIR}" -czf "${TAR_PATH}" "${BASENAME}"
if [[ ! -s "${TAR_PATH}" ]]; then
  echo "::error::tar アーカイブが空です"
  exit 2
fi

# ---- 3) 暗号化（age 優先 / gpg フォールバック）----------------------------
ENC_PATH=""
if command -v age >/dev/null 2>&1 && [[ -n "${BACKUP_AGE_RECIPIENTS:-}" ]]; then
  ENC_PATH="${BACKUP_DIR}/${BASENAME}.tar.gz.age"
  age_args=()
  IFS=',' read -r -a _recips <<< "${BACKUP_AGE_RECIPIENTS}"
  for r in "${_recips[@]}"; do
    r="$(echo "${r}" | xargs)"
    [[ -n "${r}" ]] && age_args+=( -r "${r}" )
  done
  echo "age で暗号化します（受信者 ${#age_args[@]} 件）"
  age "${age_args[@]}" -o "${ENC_PATH}" "${TAR_PATH}" || { rm -f "${ENC_PATH}"; echo "::error::age の暗号化に失敗しました"; exit 1; }
  rm -f "${TAR_PATH}"
elif command -v gpg >/dev/null 2>&1 && [[ -n "${BACKUP_GPG_RECIPIENTS:-}" ]]; then
  ENC_PATH="${BACKUP_DIR}/${BASENAME}.tar.gz.gpg"
  gpg_args=()
  IFS=',' read -r -a _recips <<< "${BACKUP_GPG_RECIPIENTS}"
  for r in "${_recips[@]}"; do
    r="$(echo "${r}" | xargs)"
    [[ -n "${r}" ]] && gpg_args+=( --recipient "${r}" )
  done
  echo "gpg で暗号化します"
  gpg --batch --yes --trust-model always "${gpg_args[@]}" \
    --output "${ENC_PATH}" --encrypt "${TAR_PATH}" || { rm -f "${ENC_PATH}"; echo "::error::gpg の暗号化に失敗しました"; exit 1; }
  rm -f "${TAR_PATH}"
else
  echo "::error::暗号化できません。age + BACKUP_AGE_RECIPIENTS もしくは gpg + BACKUP_GPG_RECIPIENTS を設定してください。平文 tar は破棄します。"
  rm -f "${TAR_PATH}"
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  ( cd "${BACKUP_DIR}" && sha256sum "$(basename "${ENC_PATH}")" > "$(basename "${ENC_PATH}").sha256" )
elif command -v shasum >/dev/null 2>&1; then
  ( cd "${BACKUP_DIR}" && shasum -a 256 "$(basename "${ENC_PATH}")" > "$(basename "${ENC_PATH}").sha256" )
fi

echo "::notice::Storage バックアップ作成: ${ENC_PATH} (${file_count} files, $(wc -c < "${ENC_PATH}") bytes)"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "enc_path=${ENC_PATH}"
    echo "basename=${BASENAME}"
    echo "file_count=${file_count}"
  } >> "${GITHUB_OUTPUT}"
fi

exit 0
