## 実装記録（2026-07-31）

### 実装内容

1. **Edge Function 型ゲート（FR-297-01）**
   - `notify-post-status/index.ts` の nullable な `record.species` を
     `SPECIES_LABELS[record.species ?? ''] ?? record.species ?? '不明'` とし、添字を非 null に確定した。
     `null` のときは空文字のラベルが存在しないため、従来どおり最終フォールバックの `'不明'` になる。
   - retry 付き `deno cache` の直後に、全 `.ts` を対象とする `deno check` を
     `edge-functions` ジョブへ追加した。テスト側は型検査の二重実行を避けるため `--no-check` を維持した。
   - 「typecheck / lint でカバー済み」という誤ったコメントを削除し、役割分担を事実に合わせた。
   - **レビュー時の追加修正（2026-07-31）**: 対象ファイルの集め方を `supabase/functions/**/*.ts` の
     glob から `find` ＋件数チェックへ変更した。理由は **globstar が無効なシェルでは `**` が `*` と
     同じ1階層マッチに退化し、`<fn>/__tests__/*.ts` を取りこぼしたまま静かに緑になる**ため
     （実測: globstar 無効だと 49 件中 **29 件**しかマッチしない）。現在は対象件数をログに出力し、
     0 件なら `::error` で落とす。REQ-306 の size-limit 自己点検（対象0件を検知して落とす）と同じ思想で、
     「ゲートが実は何も見ていない」状態を検知可能にしている。ローカル実測で **49 ファイル / exit 0**。

2. **scripts / e2e / root config の静的検査（FR-297-02）**
   - `tsconfig.json` の `exclude` から `scripts` と `tests/e2e` を外した。
   - `eslint.config.js` に CLI/root config 用と Playwright e2e 用の設定ブロックを追加し、
     `tests/e2e/**` を全体 ignore から外した。CLI の正当な標準出力を許可するため `no-console` は off とした。
   - 事前実測の `scripts/` 9件を、欠損値のガード・空配列への `flatMap`・optional chaining で修正した。

3. **カバレッジ実効ゲート（FR-297-03）**
   - CI の `npm test` を `npm run test:coverage` に置き換え、同じ suite の二重実行を避けた。
     ローカル実測は約7秒で、別ジョブ化するほどの増分ではないと判断した。
   - 閾値を statements 60 / branches 47 / functions 51 / lines 63 とした。

4. **JavaScript テスト6本の TypeScript 化（FR-297-04）**
   - 指定された6本を `.test.ts` へ移動し、翻訳スタブ、合成 ChangeEvent、モック、
     最小 Post フィクスチャ等に必要な型注釈を追加した。アサーションとテスト意図は変更していない。
   - 対象6ファイルは 83 tests、全体は 87 files / 789 tests が PASS した。

5. **e2e 可観測性（FR-297-05）**
   - CI の `maxFailures` を 1 から 5 に変更した。`workers: 1` と `fullyParallel: false` は維持した。
   - e2e 失敗時に `playwright-report/` と `test-results/` を回収する
     `actions/upload-artifact` を追加した。既存 `backup.yml` と同じ
     `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`（v7.0.1）へ SHA ピン留めした。
