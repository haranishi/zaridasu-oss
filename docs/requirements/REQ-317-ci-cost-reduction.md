# REQ-317: CI消費分数の削減（実行ティアの導入と重複フル実行の排除）

作成日: 2026-08-07
優先度: **P1** ／ 深刻度: **Medium**（品質バグではなく運用コスト。ただし無料枠枯渇でCI全停止＝デプロイ不能になる） ／ 種別: CI・運用コスト
状態: **承認済 / 実装中**（実装は本人指示によりOpusサブエージェント、要件定義・レビューはメインループが担当）
関連: REQ-180（CIゲート強化。**本REQはFR-180-01の一部を意図的に巻き戻す**）, REQ-210（セキュリティCI。ゲートの実効性は落とさない）, REQ-306（性能予算。perf-budget自体の軽量化は本REQの対象外）, REQ-298（migration-gate。デプロイ前提条件として維持）

## 背景

本リポジトリは **private** のため GitHub Actions の無料枠（2,000分/月）を実消費する。現行 `ci.yml` は `push: [main, develop]` + `pull_request: [main, develop]` で、ブランチ運用（feat → develop → main）に従うと **1つの変更に対して同一内容のフルCIが最大4回** 走る。

2026-08-07 の実測（PR #52 / #53 / main push、いずれも同一内容）:

| ジョブ | 実測時間 | 課金対象（分に切り上げ） |
|---|---|---|
| perf-budget | 11m54s | 12分 |
| e2e | 8m15s | 9分 |
| test | 7m21s | 8分 |
| schema-drift | 1m41s | 2分 |
| rls-tests / audit / edge-functions / edge-functions-deploy-lag / migration-gate / gitleaks | 各11〜38s | 各1分（計6分） |
| **フル1回の合計** | 約31分 | **約37分** |

1変更 = 約37分 × 4回 + deploy 約4分 ≈ **150分**。月13〜14変更で無料枠が尽きる。今日のLCP修正1件だけで約110分を消費した。

付随する発見（本REQの対象外だが記録する）:
- **CodeQL は全 run が skip**（private かつ GHAS 未契約では実行不能）。分は消費しないが、変更のたびに無意味なトリガーとチェック行が発生している。
- **Backup（毎日 schedule）が直近2回 failure**。バックアップが取れていない実害があり、**別REQで修理する**。

## 方針: 実行ティア

pull_request の CI は **マージプレビュー（refs/pull/N/merge）** を検証するため、「PRで緑 → マージ → push で同一ツリーを再検証」は原理的に重複である（マージまでに base が動いた場合のみ差が出るが、単独運用では稀。その残余リスクより枠枯渇の実害が大きいと判断した）。

| タイミング | 実行するもの | 消費（切り上げ） |
|---|---|---|
| feat → develop PR | **フルゲート（現行どおり全ジョブ）** | 約37分 |
| develop → main PR（リリースPR） | perf-budget **以外**の全ジョブ | 約25分 |
| main への push | **migration-gate + deploy のみ** | 約5分 |
| develop への push | **実行しない（トリガーから削除）** | 0分 |

見積: 約150分/変更 → **約67分/変更（▲55%）**。月あたり約30変更まで許容できる。

「最低限これをテストすればいい」の定義:
- **品質の本体ゲートは feat→develop PR の1回**。ここで全部を賭ける。
- リリースPRは統合の砦として e2e までは維持し、**再計測に12分かかる perf-budget だけ省く**（同一内容を直前のfeat PRで計測済みのため）。
- main push はデプロイ作業であって検証の場ではない。ただし **migration-gate（本番DBとの決定論的整合チェック）だけはデプロイ直前に毎回確認する**（REQ-298 の順序事故防止はデプロイ時点の本番状態に依存するため、PR時点の結果で代用しない）。

## FR

- **FR-317-01**: `ci.yml` の `on.push.branches` から `develop` を削除する。
  - ⚠ 運用影響: develop への直接 push は CI なしになる。**feat ブランチ + PR 運用が必須**（現運用と同じ）。この旨を ci.yml のコメントに明記する。
- **FR-317-02**: 重量・検証系ジョブ（test / e2e / perf-budget / rls-tests / schema-drift / edge-functions / edge-functions-deploy-lag / audit / gitleaks）へ job-level `if: github.event_name == 'pull_request'` を追加し、push（= main push）では起動しないようにする。
- **FR-317-03**: perf-budget の `if` はさらに `github.base_ref == 'develop'` を条件に加え、リリースPR（base = main）では実行しない。
- **FR-317-04**: `deploy` の `needs` を `[migration-gate]` に縮小する。REQ-180 FR-180-01（deploy は test/e2e/rls-tests/edge-functions/schema-drift の成功を前提とする）の**意図的な巻き戻し**であり、品質保証の場を「マージ前のPR（マージプレビュー検証）」へ一本化したことをコメントで明記する。
- **FR-317-05**: `codeql.yml` を削除する。private + GHAS 未契約では CodeQL は実行不能で、全 run が skip 実績（2026-08-07 確認）。`.github/SECURITY_SETUP.md` に「public 化または GHAS 契約時に git 履歴（本REQ）から復活させる」ことを追記する。
- **FR-317-06**: 変更後の workflow は `actionlint` で構文検証する。

## NFR

- **NFR-317-01**: セキュリティゲート（gitleaks / audit / rls-tests / migration-gate）は**PR経路では現行どおり全て維持**する。削るのは「同一内容への再実行」だけで、検査項目そのものは減らさない。
- **NFR-317-02**: migration-gate はデプロイ経路（main push）に必ず残す。決定論的ゲートを deploy の needs から外してはならない。

## AC

- **AC-01**: 本REQ実装PR（feat→develop）で従来どおり全ジョブが走り緑になる。
- **AC-02**: リリースPR（develop→main）で perf-budget がスキップされ、他は走る。
- **AC-03**: main push で起動するのが migration-gate と deploy のみで、デプロイが成功する。
- **AC-04**: develop push で CI が起動しない。
- **AC-05**: CodeQL のチェック行が新規PRに現れない。

## 対象外（将来オプション）

- perf-budget 自体の軽量化（Lighthouse 18回計測の削減）: REQ-306 のゲート感度を変える品質判断のため、効果を見てから別途。
- Backup workflow の失敗修理: 別REQとして起票する（調査は本タスクと並行で実施）。
- 他リポジトリへの横展開: 本REQの構成が安定してから。
