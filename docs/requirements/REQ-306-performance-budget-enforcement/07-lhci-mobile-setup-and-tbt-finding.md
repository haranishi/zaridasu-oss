### LHCI モバイル計測（2026-07-31 追記）

`.lighthouserc.mobile.json` を新設し、`perf-budget` ジョブで LHCI を **desktop / mobile の2回**実行する構成にした。

#### 実装内容

- **mobile config を新設**。`@lhci/cli` 0.14.0 同梱の Lighthouse 12.1.0 は **`settings.preset` に `mobile` を受け付けない**（有効値は `perf` / `experimental` / `desktop` のみ）。そのため既定の mobileSlow4G と同値（RTT 150ms・1638.4 kbps・CPU slowdown 4）＋ `formFactor: "mobile"` ＋ `screenEmulation`（412×823 / DPR 1.75）を明示指定した。
- **計測URL**: desktop に `/lp` を追加（`/`・`/trends`・`/about`・`/lp` の4本）。mobile は実行時間を抑えるため `/`・`/lp` の2本。`numberOfRuns: 3` は両方維持。
- **`/dashboard` は計測対象にしない**（FR-306-06 からの逸脱）。`DashboardPage.tsx:139` の `if (!authLoading && !user) router.replace('/')` と `:176` の `if (!user) return null` により、認証セッションを持たない LHCI では **dashboard 本体ではなく `/` へ置換される空ページしか測れない**。`robots.index=false` も `lighthouse:recommended` の SEO error assertion と噛み合わない。**JS 重量という本来の懸念は `npm run size:routes` の CHECK 1 が First Load JS 355.5 kB / 予算 375 kB として既にゲート済み**なので、Lighthouse で二重に見る必要がない。
- **`.lighthouseci/` を `.gitignore` に追加**（ローカル実行のたびに 14MB 生成されるため。`coverage/` と同じ扱い）。

#### モバイル TBT の実測と閾値

実測環境: ローカル Mac（M4 Pro）／`next start` の本番ビルド／上記 mobile 設定／各URL3回。

| URL | 1回目 | 2回目 | 3回目 | 最大 |
|---|---:|---:|---:|---:|
| `/` | 160 ms | 175 ms | 111 ms | 175 ms |
| `/lp` | 172 ms | 181 ms | 231 ms | **231 ms** |

当初はこの最大 231 ms の約 2.6 倍として **600 ms** を初期閾値に置いた。しかし **CI 実測でこの見積もりが不足していることが判明した**（次項）。

#### ⚠️ CI 実測の結果、mobile TBT の error ゲートは成立しないと判明した（→ warn へ）

PR #31 の CI で2回続けて mobile LHCI が落ち、**同じコードでも CI 実行ごとに TBT が2.5倍振れる**ことが分かった。

| 計測 | `/` の3回 | 判定 |
|---|---|---|
| ローカル Mac（M4 Pro） | 160 / 175 / 111 ms | 最大 **231 ms**（`/lp` 含む） |
| CI run `30601993127` | 868 / 1037 / 950 ms | 閾値 600 ms を超過 → **失敗** |
| CI run `30603463567`（同一コード） | 2213 / 2032 / 2119 ms | 引き上げた閾値 1600 ms も超過 → **失敗** |

つまり **CI では 868〜2213 ms の範囲で振れる**。これは次を意味する。

- ローカル実測に倍率を掛けて閾値を決める方法は、**ハードウェア差が大きいと成立しない**（当初 2.6 倍と見積もったが実際は 4〜10 倍）
- flaky を避けるために閾値を安全側（3000 ms 超）へ上げると、**本来検知したかった差（+49 kB 規模の常駐 SDK ＝ 数百 ms 規模）が runner ノイズに完全に埋もれる**。ゲートとして機能しない

これは **REQ-180 が `categories:performance` を error から warn へ降格したのとまったく同じ理由・同じ種類の問題**である（「共有 runner は CPU/IO が遅くスロットルも一定しないため、同一コミットでも大きく振れる」）。

**したがって mobile TBT は `warn` とし、可視化のみに使う。** バイト数の退行検知は**決定論的な `npm run size:routes`**（First Load JS 全量を gzip で直接計測。実行環境に依存しない）に委ね、実行時性能の本番監視は Web Vitals の RUM が担う。閾値 1600 ms は「超えたら目視する」ラインとして残す。専有 runner / self-hosted runner を使えるようになったら error 化を再検討する。

> **教訓**: 実行時性能の閾値は、**実際にゲートが走る環境で複数回測ってから**決める。1回の実測では runner のばらつきが見えず、「1回目に合わせた閾値が2回目で落ちる」ことになる。そして測った結果ゲートに向かない指標だと分かったら、**無理に error にせず、決定論的な代替指標を主ゲートに据える**ほうがよい。
