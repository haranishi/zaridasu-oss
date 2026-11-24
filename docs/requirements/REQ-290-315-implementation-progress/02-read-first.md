## ⚠️ 最初に読むこと

### 1. 変更は **PR #31（`develop` 宛・未マージ）** に載っている

2026-07-31 に `develop`（`89495e9`）から `feat/req-290-315-audit-implementation` を切ってコミット済み（141ファイル規模）。**CI は全9ジョブ green**。

- PR: <https://github.com/haranishi/zaridasu/pull/31>（**base は `develop`。main へはマージしない**）
- `main`（`c4fd757`）・`develop`（`89495e9`）はいずれも**未変更**
- **最新の変更規模・CI 結果は PR のページを正とする**（このメモに数値を焼き込むと、追記のたびにずれるため）

**本体4コミット**（これが成果物）

| コミット | 内容 |
|---|---|
| `bbd3bf6` | `docs(req)`: 要件定義26本＋索引＋本メモ |
| `bd0b2ad` | `feat(security)`: REQ-292 認可欠陥（migration・pgTAP・schema.sql・config.toml） |
| `658df89` | `feat(app)`: REQ-293/294/295/302/310/312（`src/`・`public/`・`tests/e2e/`） |
| `9efa645` | `ci`: REQ-296/297/306（ci.yml・各種 config・`scripts/`・Edge の型修正） |

**それ以降は「CI を回して分かったことへの追随」**（e2e の `webServer.timeout` 引き上げ、mobile TBT の閾値修正→最終的に warn 降格、CI 実行時間の実測記録、本メモの更新）。一覧は次で出す。

```bash
git log --oneline 9efa645..HEAD    # 本体4コミット以降の追随分
```

経緯は要件書 REQ-306 の実装記録と下の「罠」節を参照。

コミットを**この4つの粒度に留めた理由**: `src/lib/seo.ts` は REQ-310 と REQ-312 の両方、`.github/workflows/ci.yml` は REQ-296 / 297 / 306 の3つ、`src/app/layout.tsx` は REQ-293 と REQ-312 が触っており、**REQ単位に分けるには同一ファイルの部分ステージングが必要**で、途中コミットがビルド不能になる。feature→develop は Squash なので粒度の実益も小さい。

**再開時にまずやること**: `git switch feat/req-290-315-audit-implementation` してから作業する。追加分は同ブランチへコミットして PR に積む。

### 2. 現在の健全性（**2026-07-31 実測・すべて緑**）

| 検査 | 結果 |
|---|---|
| `npm run type-check` | ✅（`scripts/` と `tests/e2e/` も対象に入った状態で） |
| `npm run lint`（`--max-warnings 0`） | ✅ 0 errors / 0 warnings |
| `npm run test` | ✅ **789件 / 87ファイル** |
| `npm run test:coverage` | ✅ 61.02 / 48.15 / 52.08 / 64.19%（閾値 60/47/51/63 を満たす） |
| `npm run i18n:check` | ✅ ja/en/ko/zh parity |
| `npm run build` | ✅ |
| `npm run size` / `npm run size:routes` | ✅ 全ルート予算・共有チャンク予算・size-limit 自己点検とも通過 |
| `deno check`（Edge Function **49ファイル**） | ✅ |
| Edge Function の Deno テスト | ✅ 258件 |
| LHCI desktop / mobile | ✅ 両方 exit 0（**mobile TBT は error ではなく warn**。理由は下の「罠」節） |
| `npm audit --omit=dev` | ✅ **0 vulnerabilities** |

**ローカルだけでなく CI でも全9ジョブ green を確認済み**（`test` / `e2e` / `perf-budget` / `edge-functions` / `edge-functions-deploy-lag` / `rls-tests` / `schema-drift` / `audit` / `gitleaks`）。ただし初回 CI では **e2e と perf-budget が実際に落ちた**（ローカルでは緑だった）。何が起きたかは「罠」節を必ず読むこと。

> `npm run build` が `.next/server/pages-manifest.json` の ENOENT で落ちたら、`rm -rf .next` してから再実行する（並行作業で `.next` が中途半端になっていた事例あり。コード側の問題ではない）。
> LHCI をローカルで回すときは `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` を付ける。生成物 `.lighthouseci/`（14MB）は `.gitignore` 済み。

### 3. サブエージェントの使い分け（本セッションの運用ルール）
- **Codex を第一選択**（`subagent_type: "codex"`）。Anthropic のトークンを消費しない
- **Opus を第二選択**（`Agent` に `model: "opus"` を明示）
- **Fable をサブエージェントにしない**（メインループ専用）
- `codex exec` は逐次実行なので、**並列させるなら Opus 側**を増やす

### 4. 並列実行は「波」に分ける（重要）
26本を同時に走らせると **`src/locales/{ja,en,ko,zh}/translation.json` で編集が衝突**する。ほぼ全REQがi18nキーを追加するため、locales は**1波につき1エージェントの専有**にすること。同様に `eslint.config.js` / `.github/workflows/ci.yml` / `src/lib/seo.ts` も競合しやすい。各エージェントのプロンプトに「触ってよいファイル」と「絶対に触らないファイル」を明示すると事故が防げる。

**ci.yml は REQ-296 / 297 / 306 の3つが触っている。** この系統のREQを並列で走らせないこと（2026-07-31 は順番に実行した）。

### 5. 完了の定義＝「意図的に壊して赤くなること」を実証したか

本監査で最も繰り返し見つかった欠陥は「**ゲートは存在するのに通り抜ける経路がある**」型である。したがってゲートを追加したら、**必ずわざと壊して非0終了することを確認**してから完了にすること。2026-07-31 は9通り、2026-08-03（REQ-298）は8通り実証した（ルート予算 / 共有チャンク予算 / size-limit 対象0件 / size-limit 超過 / deno check / カバレッジ / scripts型検査 / e2e lint / LHCI mobile TBT）。

> 💡 **実証は実ファイルではなく設定のコピーに対して行うと、戻し忘れ事故が構造的に起きない。** LHCI の TBT 実証は scratchpad にコピーした config を `--config=` で指定して実施した。実ファイルを壊す方式でやる場合は、最後に必ず正規値に戻っているかを grep で確認すること（実際、作業途中で `vitest.config.ts` に実証用の `statements: 99` が残っている状態を一度観測している）。

### 6. サブエージェントの報告は鵜呑みにせず親が再検証する

2026-07-30 は aria 属性が DOM に出ていない欠陥を、2026-07-31 は `deno check` の対象ファイル収集が glob 展開に依存していた点を、いずれも**親の再検証で検出**した。報告された「実測しました」は、可能なら親が同じコマンドを1回打ち直す。

---
