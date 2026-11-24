#!/usr/bin/env bash
# scripts/check-edge-deploy-lag.sh
#
# REQ-127 Phase 3 / FR-127-11
#
# Supabase Edge Function の「本番 updated_at」と「ローカル最終 commit 時刻」を比較し、
# 24h 以上の乖離があれば warning / error を出す。
#
# 使い方:
#   SUPABASE_ACCESS_TOKEN=... \
#   SUPABASE_PROJECT_REF=edxmkqmjzbarjdgnkcvc \
#   MODE=pr|main \
#   ./scripts/check-edge-deploy-lag.sh
#
# 環境変数:
#   SUPABASE_PROJECT_REF      必須。未設定なら skip（exit 0）
#   SUPABASE_ACCESS_TOKEN     必須（supabase CLI 側で参照）。未設定なら skip
#   MODE                      "pr" もしくは "main"（default: "pr"）
#                             pr   : warning のみ、exit 0
#                             main : 1 つでも超過すれば exit 1
#   DEPLOY_LAG_WARN_HOURS     閾値 (default: 24)
#   CHANGED_FUNCTIONS         (任意) スペース区切りで判定対象関数を絞る。
#                             未指定の場合は git diff から自動検出（pr: origin/main...HEAD, main: HEAD~1..HEAD）。
#                             ※これは「deploy lag（更新時刻の乖離）」判定にのみ効く。
#                               未デプロイ検知（1.5節）は差分に関係なく常に全関数を評価する。
#   TARGET_FUNCTIONS          (任意) 監視対象関数の全リスト（スペース区切り）。
#                             未指定なら supabase/functions/*/index.ts から自動導出する
#                             （REQ-285 FR-285-05。以前の固定リストは廃止）。
#   BASE_REF                  (任意) PR モード時の比較先。デフォルト "origin/main"
#
# 意図的に未デプロイのまま運用する関数は supabase/functions/.deploy-ignore に理由付きで記載する。
#
# 標準出力: GitHub Actions の workflow command (::warning, ::error, ::notice)
# 終了コード:
#   0  : 全関数 OK もしくは skip
#   0  : MODE=pr で warning は出たが fail させない
#   1  : MODE=main で 1 つ以上の関数が閾値超過 (fail)
#   2  : 内部エラー（jq/supabase コマンド失敗）
#
set -euo pipefail

# ---- 設定 ----------------------------------------------------------------
# REQ-285 FR-285-05: 監視対象は supabase/functions/ 配下から**自動導出**する。
#   以前はここに7関数をハードコードしていたが、その7本が偶然「本番にデプロイ済みの7本」と
#   完全に一致しており、後から追加された7本（enrich-place 以降）は監視対象に一度も入らなかった。
#   結果として「一度もデプロイされていない関数」を数か月検知できなかった（REQ-285 §2-A）。
#   固定リストを廃し、リポジトリの実態を唯一の情報源にする。
FUNCTIONS_DIR="supabase/functions"
DEPLOY_IGNORE_FILE="${FUNCTIONS_DIR}/.deploy-ignore"

MODE="${MODE:-pr}"
WARN_HOURS="${DEPLOY_LAG_WARN_HOURS:-24}"
BASE_REF="${BASE_REF:-origin/main}"

# 意図的に未デプロイのまま運用する関数（理由付きで .deploy-ignore に記載）。
# 空行と # 始まりのコメント行は無視する。
declare -A IS_IGNORED
IGNORED=()
if [[ -f "${DEPLOY_IGNORE_FILE}" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    # 前後の空白を落とす
    line="$(echo "${line}" | tr -d '[:space:]')"
    [[ -z "${line}" ]] && continue
    IS_IGNORED["${line}"]=1
    IGNORED+=( "${line}" )
  done < "${DEPLOY_IGNORE_FILE}"
fi

# リポジトリ上の Edge Function 一覧（_shared 等のアンダースコア始まりは関数ではない）。
discover_functions() {
  local d name
  for d in "${FUNCTIONS_DIR}"/*/; do
    [[ -d "${d}" ]] || continue
    name="$(basename "${d}")"
    [[ "${name}" == _* ]] && continue
    [[ -f "${d}index.ts" ]] || continue
    echo "${name}"
  done
}

if [[ -n "${TARGET_FUNCTIONS:-}" ]]; then
  # shellcheck disable=SC2206
  TARGETS=( ${TARGET_FUNCTIONS} )
else
  mapfile -t TARGETS < <(discover_functions)
fi

if [[ "${#TARGETS[@]}" -eq 0 ]]; then
  echo "::error::${FUNCTIONS_DIR} から Edge Function を検出できませんでした"
  exit 2
fi

# ---- secrets ガード ------------------------------------------------------
if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "::notice::SUPABASE_PROJECT_REF が未設定のため edge-functions-deploy-lag ジョブを skip します"
  exit 0
fi
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "::notice::SUPABASE_ACCESS_TOKEN が未設定のため edge-functions-deploy-lag ジョブを skip します"
  exit 0
fi

# ---- 依存コマンド --------------------------------------------------------
if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq が見つかりません"
  exit 2
fi
if ! command -v supabase >/dev/null 2>&1; then
  echo "::error::supabase CLI が見つかりません"
  exit 2
fi

# ---- 1) 本番 updated_at 一覧を取得 --------------------------------------
# supabase functions list -o json は配列で返す。version 通知は stderr に行くので
# stdout のみを jq に渡す。
remote_json="$(supabase functions list -o json --project-ref "${SUPABASE_PROJECT_REF}" 2>/dev/null || true)"
if [[ -z "${remote_json}" ]] || ! echo "${remote_json}" | jq -e 'type=="array"' >/dev/null 2>&1; then
  echo "::error::supabase functions list の取得に失敗しました（認証 / project-ref を確認）"
  exit 2
fi

# function_name -> epoch seconds（本番 updated_at）
declare -A REMOTE_UPDATED_AT_S
while IFS=$'\t' read -r fname updated_ms; do
  [[ -z "${fname}" ]] && continue
  # updated_at はミリ秒 epoch (number)。秒に丸める。
  REMOTE_UPDATED_AT_S["${fname}"]=$(( updated_ms / 1000 ))
done < <(echo "${remote_json}" | jq -r '.[] | "\(.name)\t\(.updated_at)"')

threshold_seconds=$(( WARN_HOURS * 3600 ))

# GNU date / BSD date のどちらでも ISO8601 を UTC epoch に変換する。
iso_to_epoch() {
  local iso="$1" bsd_iso epoch
  if epoch=$(date -u -d "${iso}" +%s 2>/dev/null); then
    printf '%s\n' "${epoch}"
    return
  fi

  # BSD date の %z は +09:00 を解釈できないため、+0900 へ正規化する。
  bsd_iso="${iso/Z/+0000}"
  if [[ "${bsd_iso}" =~ [+-][0-9]{2}:[0-9]{2}$ ]]; then
    bsd_iso="${bsd_iso%:*}${bsd_iso##*:}"
  fi
  if epoch=$(date -u -j -f "%Y-%m-%dT%H:%M:%S%z" "${bsd_iso}" +%s 2>/dev/null); then
    printf '%s\n' "${epoch}"
  else
    return 1
  fi
}

# _shared は関数自身の index.ts と別に更新されるため、最終 commit 時刻も独立して比較する。
# 関数自身の比較と挙動を揃え、デプロイ猶予を同一にするため、同じ WARN_HOURS を使う。
shared_iso="$(git log -1 --format=%cI -- "${FUNCTIONS_DIR}/_shared/" 2>/dev/null || true)"
shared_s=""
if [[ -z "${shared_iso}" ]]; then
  echo "::warning::_shared: ローカル commit 時刻を取得できないため、_shared の未デプロイ判定だけを skip します"
elif ! shared_s="$(iso_to_epoch "${shared_iso}")"; then
  echo "::warning::_shared: commit 時刻 (${shared_iso}) を epoch に変換できないため、_shared の未デプロイ判定だけを skip します"
  shared_s=""
fi

# ---- 1.5) 未デプロイ検知（REQ-285 FR-285-06）------------------------------
# deploy lag（更新時刻の乖離）とは**別のチェック**。
#   - git diff によるフィルタを一切かけない。差分の有無に関わらず毎回すべての関数を評価する。
#   - 「一度もデプロイされておらず、かつ最近編集されていない関数」は、diff ベースの判定では
#     構造的に永久に検知できない。この節がその穴を塞ぐ。
#   - .deploy-ignore に理由付きで載っている関数だけを除外する。
echo "::group::edge-functions-not-deployed (repo=${#TARGETS[@]}, deployed=${#REMOTE_UPDATED_AT_S[@]}, ignored=${#IGNORED[@]})"
missing=()
for fn in "${TARGETS[@]}"; do
  [[ -n "${IS_IGNORED[${fn}]:-}" ]] && continue
  if [[ -z "${REMOTE_UPDATED_AT_S[${fn}]:-}" ]]; then
    missing+=( "${fn}" )
  fi
done

if [[ "${#IGNORED[@]}" -gt 0 ]]; then
  echo "  意図的に未デプロイ (.deploy-ignore): ${IGNORED[*]}"
  # 除外指定されているのに実際はデプロイ済み＝リストが陳腐化している。
  for fn in "${IGNORED[@]}"; do
    if [[ -n "${REMOTE_UPDATED_AT_S[${fn}]:-}" ]]; then
      echo "::warning::${fn} は .deploy-ignore に載っていますが本番にデプロイ済みです。${DEPLOY_IGNORE_FILE} から削除してください"
    fi
  done
fi

not_deployed_fail=0
if [[ "${#missing[@]}" -gt 0 ]]; then
  for fn in "${missing[@]}"; do
    msg="${fn}: 本番に存在しません（未デプロイ）。\`supabase functions deploy ${fn} --project-ref ${SUPABASE_PROJECT_REF}\` を実行するか、意図的な未デプロイなら理由を添えて ${DEPLOY_IGNORE_FILE} に追記してください"
    if [[ "${MODE}" == "main" ]]; then
      echo "::error::${msg}"
      not_deployed_fail=1
    else
      echo "::warning::${msg}"
    fi
  done
else
  echo "  OK: リポジトリの全 Edge Function が本番に存在します（除外分を除く）"
fi
echo "::endgroup::"

# ---- 1.6) _shared 未デプロイ検知（REQ-298 FR-298-02）----------------------
# 「本番の関数 updated_at が _shared/ の最終 commit より古い」を、関数自身の deploy lag とは
# **別条件**として評価する。
#
# なぜ 3 節（変更検出された関数だけを回すループ）ではなく、ここ（1.5 節と同じ差分非依存の場所）
# なのか:
#   - _shared を変更しても、各関数の index.ts の commit 時刻は動かない。3 節の比較は素通りする。
#   - FR-298-01 の全関数展開が効くのは「_shared を触った commit そのもの」を見ている実行だけ。
#     main では diff 範囲が HEAD~1..HEAD なので、その commit を過ぎた次の push からは展開が
#     起きず、**デプロイし忘れたまま静かに緑へ戻る**。1.5 節が「diff ベースでは構造的に
#     永久に検知できない」と書いているのと同じ穴が、ここにも空く。
#   - よって差分に関係なく毎回すべての関数を評価する。除外は .deploy-ignore のみ。
#
# 閾値は関数自身の deploy lag と同じ WARN_HOURS を使う。デプロイ猶予を揃えるためで、
# これは実測に基づく判断でもある: 2026-08-03 時点の本番 12 関数はすべて _shared の最終 commit
# より古いが、その差は約 2 分しかない（デプロイ直後に _shared をコミットしたため）。
# 閾値なしで「1 秒でも古ければ error」にすると、この 2 分で main が即赤になる誤検知が出る。
shared_lag_fail=0
if [[ -n "${shared_s}" ]]; then
  echo "::group::edge-functions-shared-lag (shared=${shared_iso}, threshold=${WARN_HOURS}h)"
  shared_stale=()
  for fn in "${TARGETS[@]}"; do
    [[ -n "${IS_IGNORED[${fn}]:-}" ]] && continue
    remote_s="${REMOTE_UPDATED_AT_S[${fn}]:-}"
    # 未デプロイ関数は 1.5 節が既に報告済み。ここで二重に出さない。
    [[ -z "${remote_s}" ]] && continue
    shared_lag_s=$(( shared_s - remote_s ))
    (( shared_lag_s >= threshold_seconds )) && shared_stale+=( "${fn}" )
  done

  if [[ "${#shared_stale[@]}" -gt 0 ]]; then
    for fn in "${shared_stale[@]}"; do
      remote_s="${REMOTE_UPDATED_AT_S[${fn}]}"
      remote_iso="$(date -u -r "${remote_s}" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
                  || date -u -d "@${remote_s}" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
                  || echo "epoch=${remote_s}")"
      shared_lag_s=$(( shared_s - remote_s ))
      msg="${fn}: _shared/ の変更が未デプロイです（本番 ${remote_iso} < _shared ${shared_iso}、$(( shared_lag_s / 3600 ))h$(( (shared_lag_s % 3600) / 60 ))m 古い）。_shared は全関数のバンドルに取り込まれるため、全関数の再デプロイが必要です（docs/runbooks/edge-function-deploy.md の B）"
      if [[ "${MODE}" == "main" ]]; then
        echo "::error::${msg}"
        shared_lag_fail=1
      else
        echo "::warning::${msg}"
      fi
    done
  else
    echo "  OK: 全 Edge Function の本番バンドルが _shared/ の最終 commit 以降のものです"
  fi
  echo "::endgroup::"
fi

# ---- 2) 変更対象関数の判定 -----------------------------------------------
# CHANGED_FUNCTIONS が明示されていればそれを使う。
# それ以外は git diff から検出。
detect_changed_functions() {
  local diff_range
  if [[ "${MODE}" == "main" ]]; then
    # main 上の push: 直前 commit との diff
    if git rev-parse HEAD~1 >/dev/null 2>&1; then
      diff_range="HEAD~1..HEAD"
    else
      # 初回 commit 等のフォールバック: 全関数を対象に
      printf '%s\n' "${TARGETS[@]}"
      return
    fi
  else
    diff_range="${BASE_REF}...HEAD"
  fi

  # supabase/functions/<name>/ 配下の変更があった <name> を抜き出す。
  # _shared は呼び出し側で全関数へ展開するため、識別子としてそのまま返す。
  git diff --name-only "${diff_range}" 2>/dev/null \
    | awk -F/ '$1=="supabase" && $2=="functions" && $3!="" {print $3}' \
    | sort -u
}

if [[ -n "${CHANGED_FUNCTIONS:-}" ]]; then
  # shellcheck disable=SC2206
  CHANGED=( ${CHANGED_FUNCTIONS} )
else
  mapfile -t DETECTED_CHANGED < <(detect_changed_functions || true)

  # _shared の変更は全関数のバンドルに波及する。直接変更分との和集合を作り、
  # 展開後は意図的に未デプロイの .deploy-ignore 記載関数だけを除外する。
  shared_changed=0
  declare -A CHANGED_SET
  for fn in "${DETECTED_CHANGED[@]}"; do
    if [[ "${fn}" == "_shared" ]]; then
      shared_changed=1
    else
      CHANGED_SET["${fn}"]=1
    fi
  done

  if [[ "${shared_changed}" -eq 1 ]]; then
    for fn in "${TARGETS[@]}"; do
      CHANGED_SET["${fn}"]=1
    done

    ignored_expanded=0
    for fn in "${!CHANGED_SET[@]}"; do
      if [[ -n "${IS_IGNORED[${fn}]:-}" ]]; then
        unset "CHANGED_SET[${fn}]"
        ignored_expanded=$(( ignored_expanded + 1 ))
      fi
    done
    echo "  _shared/ に変更あり → 全 ${#TARGETS[@]} 関数を判定対象へ展開（.deploy-ignore の ${ignored_expanded} 本を除く）"
  fi

  CHANGED=()
  for fn in "${!CHANGED_SET[@]}"; do
    CHANGED+=( "${fn}" )
  done
  if [[ "${#CHANGED[@]}" -gt 0 ]]; then
    mapfile -t CHANGED < <(printf '%s\n' "${CHANGED[@]}" | sort -u)
  fi
fi

# CHANGED は filter として使う（main モードでも diff に該当しない関数は skip）。
# 「diff に含まれていないが古い」関数まで全部 fail させると、無関係な PR が落ちて
# しまうので、要件通り「変更があった関数」のみ対象にする。
declare -A IS_CHANGED
for fn in "${CHANGED[@]}"; do
  IS_CHANGED["${fn}"]=1
done

if [[ "${#CHANGED[@]}" -eq 0 ]]; then
  echo "::notice::Edge Function の変更が無いため deploy-lag チェックを skip しました (mode=${MODE})"
  # 未デプロイ検知（1.5節）と _shared 未デプロイ検知（1.6節）は差分に関係なく実施済みなので、
  # その結果は必ず反映する。ここを落とすと「変更0件だから緑」で穴が復活する。
  if [[ "${MODE}" == "main" && ( "${not_deployed_fail}" -eq 1 || "${shared_lag_fail}" -eq 1 ) ]]; then
    echo "::error::edge-functions-deploy-lag: 未デプロイの Edge Function、または _shared/ の未デプロイ変更があります。"
    exit 1
  fi
  exit 0
fi

echo "::group::edge-functions-deploy-lag (mode=${MODE}, threshold=${WARN_HOURS}h)"
echo "判定対象関数: ${CHANGED[*]}"

# ---- 3) 各関数を比較 ------------------------------------------------------
fail=0

for fn in "${CHANGED[@]}"; do
  # ターゲット外の関数は無視（_shared など）。
  case " ${TARGETS[*]} " in
    *" ${fn} "*) ;;
    *)
      echo "  - ${fn}: ターゲット外のため skip"
      continue
      ;;
  esac

  index_path="supabase/functions/${fn}/index.ts"
  if [[ ! -f "${index_path}" ]]; then
    echo "::warning::${fn}: ${index_path} がローカルに存在しません（削除 PR の可能性）"
    continue
  fi

  remote_s="${REMOTE_UPDATED_AT_S[${fn}]:-}"
  if [[ -z "${remote_s}" ]]; then
    # 本番未デプロイ → 本来は fail させたいが、新規追加 PR では正常なケース。
    # PR では warning、main では error にする。
    if [[ "${MODE}" == "main" ]]; then
      echo "::error::${fn}: 本番に存在しません（未デプロイ）。supabase functions deploy ${fn} を実行してください"
      fail=1
    else
      echo "::warning::${fn}: 本番に存在しません（未デプロイ）。merge までに supabase functions deploy ${fn} を実施してください"
    fi
    continue
  fi

  remote_iso="$(date -u -r "${remote_s}" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
              || date -u -d "@${remote_s}" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
              || echo "epoch=${remote_s}")"

  # 関数自身のローカル最終 commit 時刻を比較する。
  # --follow でリネーム/移動も追跡する。取得失敗時も _shared の比較は続ける。
  local_iso="$(git log -1 --follow --format=%cI -- "${index_path}" 2>/dev/null || true)"
  local_s=""
  if [[ -z "${local_iso}" ]]; then
    echo "::warning::${fn}: ローカル commit 時刻を取得できませんでした"
  elif ! local_s="$(iso_to_epoch "${local_iso}")"; then
    echo "::warning::${fn}: commit 時刻 (${local_iso}) を epoch に変換できませんでした"
    local_s=""
  fi

  if [[ -n "${local_s}" ]]; then
    lag_s=$(( local_s - remote_s ))
    # lag は「ローカル最新 commit が本番より何秒新しいか」
    # マイナスや 0 以下は問題なし。
    if (( lag_s <= 0 )); then
      echo "  - ${fn}: OK (本番 updated_at >= ローカル commit)"
    else
      lag_h=$(( lag_s / 3600 ))
      lag_remain_m=$(( (lag_s % 3600) / 60 ))
      if (( lag_s >= threshold_seconds )); then
        msg="${fn}: 本番が ${lag_h}h${lag_remain_m}m 古い (local=${local_iso}, remote=${remote_iso})。\`supabase functions deploy ${fn} --project-ref ${SUPABASE_PROJECT_REF}\` を実行してください"
        if [[ "${MODE}" == "main" ]]; then
          echo "::error::${msg}"
          fail=1
        else
          echo "::warning::${msg}"
        fi
      else
        echo "  - ${fn}: 軽微な遅延 ${lag_h}h${lag_remain_m}m (閾値内, threshold=${WARN_HOURS}h)"
      fi
    fi
  fi

done

echo "::endgroup::"

# ---- 4) 終了コード -------------------------------------------------------
if [[ "${MODE}" == "main" && ( "${fail}" -eq 1 || "${not_deployed_fail}" -eq 1 || "${shared_lag_fail}" -eq 1 ) ]]; then
  echo "::error::edge-functions-deploy-lag: main ブランチで未デプロイ関数またはデプロイラグが検出されました。Edge Function を deploy してから再実行してください。"
  exit 1
fi
exit 0
