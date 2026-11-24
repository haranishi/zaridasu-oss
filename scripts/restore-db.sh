#!/usr/bin/env bash
# scripts/restore-db.sh
#
# REQ-217 (FR-217-05 / FR-217-06) — 暗号化 DB ダンプの復号 + リストア補助。
#
# backup-db.sh が作った `*.sql.age` / `*.sql.gpg` を復号し、指定の DB へ流し込む。
# **復号鍵（age 秘密鍵 / gpg 秘密鍵）は運用者ローカルにのみ存在**する前提で、
# 本スクリプトは鍵を生成も保管もしない（NFR-217-01）。
#
# リストア訓練（FR-217-06）では DRY_RUN=1 で復号 + 整合チェックのみ、
# あるいは TARGET_DB_URL=postgres://...@127.0.0.1:54322/postgres（supabase start のローカル）に流す。
#
# 使い方:
#   # 復号のみ（中身確認）
#   AGE_IDENTITY_FILE=~/.age/zaridasu-backup.key DRY_RUN=1 \
#     ./scripts/restore-db.sh ./backups/zaridasu-db-2026....sql.age
#
#   # ローカル supabase へリストア
#   AGE_IDENTITY_FILE=~/.age/zaridasu-backup.key \
#   TARGET_DB_URL="postgres://postgres:postgres@127.0.0.1:54322/postgres" \
#     ./scripts/restore-db.sh ./backups/zaridasu-db-2026....sql.age
#
# 引数:
#   $1   暗号化ダンプのパス（*.age もしくは *.gpg）。必須。
#
# 環境変数:
#   AGE_IDENTITY_FILE   age 秘密鍵ファイル（*.age を復号する場合に必須）。
#   GPG は gpg-agent / キーリングの秘密鍵を自動使用（*.gpg を復号する場合）。
#   TARGET_DB_URL       リストア先 DB 接続文字列。DRY_RUN=1 のときは未使用。
#   DRY_RUN             "1" なら復号して内容を検証するだけで DB へは流さない。
#   SKIP_CHECKSUM       "1" なら同名 .sha256 があっても整合チェックをスキップ。
#
# 終了コード:
#   0  : 成功
#   1  : 引数 / 鍵不足
#   2  : 復号 / リストア失敗・整合不一致
#
# ⚠ 秘密保持: TARGET_DB_URL / 鍵パスの中身は echo しない。set -x も使わない。
set -euo pipefail

ENC_PATH="${1:-}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "${ENC_PATH}" ]]; then
  echo "使い方: $0 <暗号化ダンプ.(age|gpg)>" >&2
  exit 1
fi
if [[ ! -f "${ENC_PATH}" ]]; then
  echo "::error::ファイルが見つかりません: ${ENC_PATH}" >&2
  exit 1
fi

# ---- 0) 整合チェック（.sha256 があれば）----------------------------------
if [[ "${SKIP_CHECKSUM:-0}" != "1" && -f "${ENC_PATH}.sha256" ]]; then
  echo "SHA-256 整合チェック..."
  if command -v sha256sum >/dev/null 2>&1; then
    ( cd "$(dirname "${ENC_PATH}")" && sha256sum -c "$(basename "${ENC_PATH}").sha256" )
  elif command -v shasum >/dev/null 2>&1; then
    ( cd "$(dirname "${ENC_PATH}")" && shasum -a 256 -c "$(basename "${ENC_PATH}").sha256" )
  else
    echo "::warning::sha256sum / shasum が無いため整合チェックを skip しました"
  fi
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/zaridasu-restore.XXXXXX")"
PLAIN_PATH="${WORKDIR}/restore.sql"
cleanup() {
  if [[ -f "${PLAIN_PATH}" ]]; then
    if command -v shred >/dev/null 2>&1; then shred -u "${PLAIN_PATH}" 2>/dev/null || true; fi
  fi
  rm -rf "${WORKDIR}" 2>/dev/null || true
}
trap cleanup EXIT

# ---- 1) 復号 --------------------------------------------------------------
case "${ENC_PATH}" in
  *.age)
    if ! command -v age >/dev/null 2>&1; then
      echo "::error::age が見つかりません" >&2; exit 2
    fi
    if [[ -z "${AGE_IDENTITY_FILE:-}" ]]; then
      echo "::error::AGE_IDENTITY_FILE（age 秘密鍵）が未設定です" >&2; exit 1
    fi
    echo "age で復号します..."
    age -d -i "${AGE_IDENTITY_FILE}" -o "${PLAIN_PATH}" "${ENC_PATH}"
    ;;
  *.gpg)
    if ! command -v gpg >/dev/null 2>&1; then
      echo "::error::gpg が見つかりません" >&2; exit 2
    fi
    echo "gpg で復号します（秘密鍵はキーリングから）..."
    gpg --batch --yes --output "${PLAIN_PATH}" --decrypt "${ENC_PATH}"
    ;;
  *)
    echo "::error::未知の拡張子です（*.age もしくは *.gpg を渡してください）: ${ENC_PATH}" >&2
    exit 1
    ;;
esac

if [[ ! -s "${PLAIN_PATH}" ]]; then
  echo "::error::復号結果が空です" >&2; exit 2
fi
echo "復号成功: $(wc -c < "${PLAIN_PATH}") bytes / $(wc -l < "${PLAIN_PATH}") lines"

# 簡易サニティチェック: ダンプらしい行が含まれているか。
if ! grep -qiE 'CREATE TABLE|COPY |INSERT INTO|PostgreSQL database dump' "${PLAIN_PATH}"; then
  echo "::warning::ダンプらしい SQL 行が見当たりません。中身を目視確認してください。"
fi

# ---- 2) リストア（DRY_RUN でなければ）-------------------------------------
if [[ "${DRY_RUN}" == "1" ]]; then
  echo "::notice::DRY_RUN=1 のため DB へは流しません。先頭を表示します。"
  head -n 20 "${PLAIN_PATH}" || true
  exit 0
fi

if [[ -z "${TARGET_DB_URL:-}" ]]; then
  echo "::error::TARGET_DB_URL が未設定です（DRY_RUN=1 でない場合は必須）" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "::error::psql が見つかりません" >&2; exit 2
fi

echo "::group::psql リストア（接続文字列はログに出しません）"
# ON_ERROR_STOP=1: 途中でエラーが出たら止める（壊れた状態で続行しない）。
psql --set ON_ERROR_STOP=1 -f "${PLAIN_PATH}" "${TARGET_DB_URL}"
echo "::endgroup::"

echo "::notice::DB リストア完了。次は scripts/restore-storage.sh で Storage を投入し、整合チェックを実施してください（runbook 参照）。"
exit 0
