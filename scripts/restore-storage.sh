#!/usr/bin/env bash
# scripts/restore-storage.sh
#
# REQ-217 (FR-217-05 / FR-217-06) — 暗号化 Storage アーカイブの復号 + バケットへ投入。
#
# backup-storage.sh が作った `*.tar.gz.age` / `*.tar.gz.gpg` を復号・展開し、
# 復元先プロジェクトの Storage バケットへ S3 互換 API でアップロードする。
# バケット自体（post-photos / post-audio とポリシー）は schema.sql / migration の
# 適用で再作成される前提（runbook 参照）。本スクリプトは「実体ファイルの投入」を担う。
#
# 使い方:
#   # 復号 + 展開のみ（中身確認）
#   AGE_IDENTITY_FILE=~/.age/zaridasu-backup.key DRY_RUN=1 \
#     ./scripts/restore-storage.sh ./backups/zaridasu-storage-2026....tar.gz.age
#
#   # 復元先へ投入
#   AGE_IDENTITY_FILE=~/.age/zaridasu-backup.key \
#   SUPABASE_PROJECT_REF=<restore-target-ref> \
#   SUPABASE_STORAGE_S3_ACCESS_KEY=... SUPABASE_STORAGE_S3_SECRET_KEY=... \
#     ./scripts/restore-storage.sh ./backups/zaridasu-storage-2026....tar.gz.age
#
# 引数:
#   $1   暗号化アーカイブのパス（*.tar.gz.age もしくは *.tar.gz.gpg）。必須。
#
# 環境変数:
#   AGE_IDENTITY_FILE                age 秘密鍵（*.age 復号時に必須）。
#   DRY_RUN                          "1" なら復号 + 展開だけ行い、アップロードしない。
#   SUPABASE_PROJECT_REF             投入先プロジェクト ref（DRY_RUN でないとき必須）。
#   SUPABASE_STORAGE_S3_ENDPOINT     任意。default https://<ref>.supabase.co/storage/v1/s3。
#   SUPABASE_STORAGE_S3_ACCESS_KEY   投入先の S3 access key（DRY_RUN でないとき必須）。
#   SUPABASE_STORAGE_S3_SECRET_KEY   投入先の S3 secret key（同上）。
#   SUPABASE_STORAGE_S3_REGION       default ap-northeast-1。
#   STORAGE_BUCKETS                  任意。default は展開結果のサブディレクトリ全部。
#
# 終了コード: 0 成功 / 1 引数・鍵不足 / 2 復号・アップロード失敗
#
# ⚠ 秘密保持: 鍵・アクセスキーの実値は echo しない。set -x も使わない。
set -euo pipefail

ENC_PATH="${1:-}"
DRY_RUN="${DRY_RUN:-0}"
S3_REGION="${SUPABASE_STORAGE_S3_REGION:-ap-northeast-1}"

if [[ -z "${ENC_PATH}" ]]; then
  echo "使い方: $0 <暗号化アーカイブ.(tar.gz.age|tar.gz.gpg)>" >&2
  exit 1
fi
if [[ ! -f "${ENC_PATH}" ]]; then
  echo "::error::ファイルが見つかりません: ${ENC_PATH}" >&2
  exit 1
fi

if [[ "${SKIP_CHECKSUM:-0}" != "1" && -f "${ENC_PATH}.sha256" ]]; then
  echo "SHA-256 整合チェック..."
  if command -v sha256sum >/dev/null 2>&1; then
    ( cd "$(dirname "${ENC_PATH}")" && sha256sum -c "$(basename "${ENC_PATH}").sha256" )
  elif command -v shasum >/dev/null 2>&1; then
    ( cd "$(dirname "${ENC_PATH}")" && shasum -a 256 -c "$(basename "${ENC_PATH}").sha256" )
  fi
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/zaridasu-restore-st.XXXXXX")"
TAR_PATH="${WORKDIR}/storage.tar.gz"
EXTRACT_DIR="${WORKDIR}/extract"
mkdir -p "${EXTRACT_DIR}"
cleanup() { rm -rf "${WORKDIR}" 2>/dev/null || true; }
trap cleanup EXIT

# ---- 1) 復号 --------------------------------------------------------------
case "${ENC_PATH}" in
  *.age)
    command -v age >/dev/null 2>&1 || { echo "::error::age が見つかりません" >&2; exit 2; }
    [[ -n "${AGE_IDENTITY_FILE:-}" ]] || { echo "::error::AGE_IDENTITY_FILE が未設定です" >&2; exit 1; }
    age -d -i "${AGE_IDENTITY_FILE}" -o "${TAR_PATH}" "${ENC_PATH}"
    ;;
  *.gpg)
    command -v gpg >/dev/null 2>&1 || { echo "::error::gpg が見つかりません" >&2; exit 2; }
    gpg --batch --yes --output "${TAR_PATH}" --decrypt "${ENC_PATH}"
    ;;
  *)
    echo "::error::未知の拡張子です（*.tar.gz.age / *.tar.gz.gpg）: ${ENC_PATH}" >&2
    exit 1
    ;;
esac

[[ -s "${TAR_PATH}" ]] || { echo "::error::復号結果が空です" >&2; exit 2; }

# ---- 2) 展開 --------------------------------------------------------------
tar -C "${EXTRACT_DIR}" -xzf "${TAR_PATH}"
# tar の中身は <basename>/<bucket>/... の階層。bucket ルートを特定する。
ROOT_DIR="$(find "${EXTRACT_DIR}" -mindepth 1 -maxdepth 1 -type d | head -1)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "::error::展開結果にディレクトリがありません" >&2; exit 2
fi
file_count="$(find "${ROOT_DIR}" -type f | wc -l | tr -d ' ')"
echo "展開完了: ${ROOT_DIR} (${file_count} files)"

# 対象バケット = 明示指定 もしくは 展開ディレクトリのサブフォルダ名。
if [[ -n "${STORAGE_BUCKETS:-}" ]]; then
  BUCKETS="${STORAGE_BUCKETS}"
else
  BUCKETS="$(find "${ROOT_DIR}" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | tr '\n' ' ')"
fi
echo "対象バケット: ${BUCKETS}"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "::notice::DRY_RUN=1 のためアップロードしません。展開ツリーは ${ROOT_DIR}（プロセス終了で削除）。"
  find "${ROOT_DIR}" -maxdepth 2 -type d -print
  exit 0
fi

# ---- 3) 投入 --------------------------------------------------------------
[[ -n "${SUPABASE_PROJECT_REF:-}" ]] || { echo "::error::SUPABASE_PROJECT_REF が未設定です" >&2; exit 1; }
[[ -n "${SUPABASE_STORAGE_S3_ACCESS_KEY:-}" && -n "${SUPABASE_STORAGE_S3_SECRET_KEY:-}" ]] \
  || { echo "::error::投入先の S3 access/secret key が未設定です" >&2; exit 1; }

S3_ENDPOINT="${SUPABASE_STORAGE_S3_ENDPOINT:-https://${SUPABASE_PROJECT_REF}.supabase.co/storage/v1/s3}"

upload_bucket() {
  local bucket="$1" src="${ROOT_DIR}/$1"
  [[ -d "${src}" ]] || { echo "  - ${bucket}: ソース無しのため skip"; return; }
  if command -v aws >/dev/null 2>&1; then
    export AWS_ACCESS_KEY_ID="${SUPABASE_STORAGE_S3_ACCESS_KEY}"
    export AWS_SECRET_ACCESS_KEY="${SUPABASE_STORAGE_S3_SECRET_KEY}"
    export AWS_DEFAULT_REGION="${S3_REGION}"
    echo "  - aws s3 sync ${src} -> s3://${bucket}"
    aws s3 sync "${src}" "s3://${bucket}" --endpoint-url "${S3_ENDPOINT}" --no-progress
  elif command -v rclone >/dev/null 2>&1; then
    echo "  - rclone copy ${src} -> ${bucket}"
    rclone copy "${src}" ":s3:${bucket}" \
      --s3-provider Other --s3-endpoint "${S3_ENDPOINT}" --s3-region "${S3_REGION}" \
      --s3-access-key-id "${SUPABASE_STORAGE_S3_ACCESS_KEY}" \
      --s3-secret-access-key "${SUPABASE_STORAGE_S3_SECRET_KEY}" \
      --s3-force-path-style --transfers 8
  else
    echo "::error::aws CLI も rclone も見つかりません" >&2; exit 2
  fi
}

echo "::group::Storage 投入"
for b in ${BUCKETS}; do
  upload_bucket "${b}"
done
echo "::endgroup::"

echo "::notice::Storage 投入完了（${file_count} files）。runbook の整合チェック（posts の URL と実体の一致）を実施してください。"
exit 0
