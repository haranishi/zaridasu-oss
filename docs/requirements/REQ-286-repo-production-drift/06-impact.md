## 8. 影響範囲

### 新規

- `scripts/check-migration-drift.sh`（仮）— FR-286-04
- CI ジョブまたは既存ジョブへのステップ追加

### 変更

- `supabase/migrations/README.md` — 本数・適用状況・索引テーブル
- `docs/README.md` — 運用ルールに FR-286-06 を追記
- `.github/workflows/ci.yml`

### git 履歴

- 未追跡ファイル 4〜5 件の追加（うち 1 件は本番適用済み migration）

### 他要件への影響

- **REQ-285**: 未デプロイ Edge Function の検知と本要件の migration 乖離検知は、いずれも「リポジトリと本番の一致」を守る仕組みである。スクリプトの構造（secrets ガード・MODE 方式・許容リスト）を揃えると保守しやすい
- **REQ-281 FR-281-01**: 本要件の突合は「適用済みバージョンの一致」までを見る。スキーマ内容そのものの等価性検証は REQ-281 の範囲であり、両者は補完関係にある

---
