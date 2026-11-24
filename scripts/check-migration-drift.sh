#!/usr/bin/env bash
# scripts/check-migration-drift.sh
#
# REQ-286 FR-286-04 / FR-286-05
#
# 「リポジトリと本番のどちらか一方にしか存在しない migration」を検知する。
#
# 背景（REQ-286 §1）:
#   2026-07-28、本番へ `supabase db push` で適用した migration
#   （20260728000001_drop_legacy_analyze_image_webhook.sql）がコミットされないまま残り、
#   git 管理下 58 本 / 本番適用済み 59 本という乖離が発生した。リポジトリを clone しても
#   本番を再現できない状態であり、CI もその migration を一度も検証していなかった。
#   この故障モードを拾う仕組みが存在しなかったため、手作業の棚卸しでしか気づけなかった。
#
# 検知する 3 種:
#   (a) 本番にあるがリポジトリに無い → **error**（リポジトリが本番を再現できない）
#   (b) リポジトリにあるが本番に無い → 既定は **warning**（デプロイ待ちの正常状態でもありうる）。
#       UNAPPLIED_SEVERITY=error かつ MODE=main のときだけ error（REQ-298 FR-298-04 のデプロイゲート）
#   (c) 同じ version で内容が違う（適用済みファイルを後から書き換えた）→ MODE=main で error
#       （REQ-298 FR-298-03。statements の正規化ハッシュ突合）
#
# 併せて FR-286-05: supabase/migrations/README.md 冒頭の本数表記が実ファイル数と
# 一致することを検証する（索引の陳腐化検知）。
#
# 使い方:
#   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... MODE=pr|main ./scripts/check-migration-drift.sh
#
# 環境変数:
#   SUPABASE_PROJECT_REF   必須。未設定ならmainでは失敗、prではskip
#   SUPABASE_ACCESS_TOKEN  必須。未設定ならmainでは失敗、prではskip
#   MODE                   "pr"（既定・warning のみ）/ "main"（(a)(c) と索引不一致で exit 1）
#   UNAPPLIED_SEVERITY     "warning"（既定）/ "error"。MODE=main のときだけ効く。
#                          CI の migration-gate ジョブが "error" を渡し、本番未適用 migration が
#                          あるときに本番デプロイをブロックする（REQ-298 FR-298-04）。
#                          既定を warning に保つのは、ローカル実行や情報系の呼び出しの挙動を
#                          変えないため。
#
# 終了コード:
#   0 : OK もしくは skip、または MODE=pr
#   1 : MODE=main で (a)(c) もしくは索引不一致を検出（UNAPPLIED_SEVERITY=error なら (b) も）
#   2 : 内部エラー
#
# 注: 本スクリプトは本番 DB へ**読み取りのみ**でアクセスする（NFR-286-01）。
#     出力にトークン・接続情報を含めない（NFR-286-02）。

set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
README="${MIGRATIONS_DIR}/README.md"
MODE="${MODE:-pr}"
UNAPPLIED_SEVERITY="${UNAPPLIED_SEVERITY:-warning}"

# ---- secrets ガード ------------------------------------------------------
if [[ "${MODE}" != "pr" && "${MODE}" != "main" ]]; then
  echo "::error::MODE は pr または main を指定してください"
  exit 2
fi
for setting in SUPABASE_PROJECT_REF SUPABASE_ACCESS_TOKEN; do
  if [[ -z "${!setting:-}" ]]; then
    if [[ "${MODE}" == "main" ]]; then
      echo "::error::${setting} が未設定のため本番migrationを照合できません。配備を停止します"
      exit 2
    fi
    echo "::notice::${setting} が未設定のため migration-drift チェックを skip します"
    exit 0
  fi
done
if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq が見つかりません"
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "::error::node が見つかりません"
  exit 2
fi

fail=0
echo "::group::migration-drift (mode=${MODE})"

# ---- 1) リポジトリ側のバージョン一覧 --------------------------------------
# ファイル名 <version>_<説明>.sql の先頭タイムスタンプ部分を取る。
# 注: mapfile / 連想配列は使わない（bash 3.2 でも動かし、ローカルで検証できるようにするため）。
local_list="$(
  find "${MIGRATIONS_DIR}" -maxdepth 1 -name '*.sql' -type f -print0 \
    | xargs -0 -n1 basename \
    | sed -E 's/^([0-9]+)_.*\.sql$/\1/' \
    | grep -E '^[0-9]+$' \
    | sort -u
)"
local_count="$(printf '%s\n' "${local_list}" | grep -c . || true)"

if [[ "${local_count}" -eq 0 ]]; then
  echo "::error::${MIGRATIONS_DIR} から migration を検出できませんでした"
  exit 2
fi

# ---- 2) 本番側の適用済みバージョン一覧 ------------------------------------
# Management API 経由で読み取り専用のクエリを 1 本だけ投げる。
# （supabase migration list は DB パスワードを要求するため、CI が既に持つ
#   SUPABASE_ACCESS_TOKEN だけで完結するこちらを使う）
remote_json="$(
  curl -sS -X POST \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --max-time 60 \
    -d '{"query":"select version, name, statements from supabase_migrations.schema_migrations order by version;"}' \
    2>/dev/null || true
)"

if [[ -z "${remote_json}" ]] || ! echo "${remote_json}" | jq -e 'type=="array"' >/dev/null 2>&1; then
  echo "::error::本番の schema_migrations を取得できませんでした（access token / project-ref を確認）"
  exit 2
fi

remote_list="$(echo "${remote_json}" | jq -r '.[].version' | sort -u)"
remote_count="$(printf '%s\n' "${remote_list}" | grep -c . || true)"

echo "  リポジトリ: ${local_count} 本 / 本番適用済み: ${remote_count} 本"

# ---- 3) 差分 --------------------------------------------------------------

# (a) 本番にあるがリポジトリに無い
only_remote="$(comm -13 <(echo "${local_list}") <(echo "${remote_list}") || true)"
# (b) リポジトリにあるが本番に無い
only_local="$(comm -23 <(echo "${local_list}") <(echo "${remote_list}") || true)"

if [[ -n "${only_remote}" ]]; then
  while IFS= read -r v; do
    [[ -z "${v}" ]] && continue
    msg="migration ${v} は本番に適用済みですが、リポジトリに存在しません。適用した .sql をコミットしてください（リポジトリから本番を再現できません）"
    if [[ "${MODE}" == "main" ]]; then
      echo "::error::${msg}"
      fail=1
    else
      echo "::warning::${msg}"
    fi
  done <<< "${only_remote}"
else
  echo "  OK: 本番にのみ存在する migration はありません"
fi

if [[ -n "${only_local}" ]]; then
  while IFS= read -r v; do
    [[ -z "${v}" ]] && continue
    msg="migration ${v} はリポジトリにありますが本番未適用です。\`supabase db push\` を実施してください（手順: docs/runbooks/migration-deploy-order.md）"
    if [[ "${UNAPPLIED_SEVERITY}" == "error" && "${MODE}" == "main" ]]; then
      # REQ-298 FR-298-04: 本番デプロイのゲート（migration-gate ジョブ）としての呼び出し。
      # 「新しいカラムを読むフロントが先に本番へ出て migration は手動待ち」という順序事故を止める。
      echo "::error::${msg}"
      fail=1
    else
      echo "::warning::${msg}（デプロイ待ちなら正常）"
    fi
  done <<< "${only_local}"
else
  echo "  OK: 本番未適用の migration はありません"
fi

# ---- 3b) 適用済み migration の内容ドリフト検知 ---------------------------
drift_json=''
if ! drift_json="$(
  printf '%s\n' "${remote_json}" \
    | jq -c '{prod: (map({key: (.version | tostring), value: ((.statements // []) | join(";"))}) | from_entries)}' \
    | node scripts/normalize-migration-sql.mjs
)"; then
  echo "::error::migration 内容の正規化・ハッシュ比較に失敗しました"
  exit 2
fi

if [[ -z "${drift_json}" ]] || ! printf '%s\n' "${drift_json}" | jq -e '.drift | type == "array"' >/dev/null 2>&1; then
  echo "::error::migration 内容の比較結果を読み取れませんでした"
  exit 2
fi

drift_count="$(printf '%s\n' "${drift_json}" | jq '.drift | length')"
if [[ "${drift_count}" -gt 0 ]]; then
  while IFS= read -r entry; do
    [[ -z "${entry}" ]] && continue
    version="$(echo "${entry}" | jq -r '.version')"
    file="$(echo "${entry}" | jq -r '.file')"
    msg="migration ${version} (${file}) は本番適用済みの内容と一致しません。適用済み migration のファイルが後から書き換えられています。適用済みファイルを元に戻し、変更は新しい migration ファイルで出してください"
    if [[ "${MODE}" == "main" ]]; then
      echo "::error::${msg}"
      fail=1
    else
      echo "::warning::${msg}"
    fi
  done <<< "$(printf '%s\n' "${drift_json}" | jq -c '.drift[]')"
else
  drift_summary="$(printf '%s\n' "${drift_json}" \
    | jq -r '"\(.checked) 本を比較" + (if (.ignored | length) > 0 then " / \(.ignored | length) 本を除外" else "" end)')"
  echo "  OK: 適用済み migration の内容ドリフトはありません（${drift_summary}）"
fi

# ---- 4) 索引（README）の陳腐化検知（FR-286-05）----------------------------
if [[ -f "${README}" ]]; then
  # 冒頭の「全 **NN** 本」表記を拾う（太字の有無・全半角スペースの揺れを許容）。
  readme_count="$(grep -oE '全[[:space:]]*\*{0,2}[0-9]+\*{0,2}[[:space:]]*本' "${README}" \
                  | head -1 | grep -oE '[0-9]+' || true)"
  if [[ -z "${readme_count}" ]]; then
    echo "::warning::${README} から本数表記（例: 全 **59** 本）を検出できませんでした"
  elif [[ "${readme_count}" != "${local_count}" ]]; then
    msg="${README} の本数表記 ${readme_count} が実ファイル数 ${local_count} と一致しません。索引を更新してください（REQ-282 C-3 チェックリスト 1）"
    if [[ "${MODE}" == "main" ]]; then
      echo "::error::${msg}"
      fail=1
    else
      echo "::warning::${msg}"
    fi
  else
    echo "  OK: README の本数表記 (${readme_count}) が実ファイル数と一致します"
  fi
fi

echo "::endgroup::"

# ---- 5) 終了コード --------------------------------------------------------
if [[ "${MODE}" == "main" && "${fail}" -eq 1 ]]; then
  echo "::error::migration-drift: リポジトリと本番の migration が乖離しています。"
  exit 1
fi
exit 0
