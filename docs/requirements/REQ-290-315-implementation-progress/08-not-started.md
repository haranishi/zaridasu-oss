## ⬜ 未着手14件 — 推奨する実施順

> 2026-07-31 に **REQ-297 / REQ-306 / REQ-312 が完了**したため、検査基盤の穴のうち残るのは **REQ-298** だけになった。

### 次にやるべき

> **REQ-298 は 2026-08-03 に完了**（FR-298-08 の PG17 統一のみ別PR）。検査基盤の穴はこれで塞がった。

1. **REQ-316（SECURITY DEFINER 関数の EXECUTE 最小権限化）＝ 2026-08-03 に起票済み・最優先** — 要件書 `REQ-316-security-definer-execute-minimization.md`。REQ-298 実装中に発覚した「本番で anon が直接実行できる SECURITY DEFINER 43本」の体系的是正。**群A(12・実害)/群B(23・本体で防御済)/群C(8・公開が正当)** に分類済み。P0は `call_lifecycle_edge_function` 系（anon が Vault の service_role キーで任意 Edge Function を起動可）と `get_ai_cost_summary` の認可バイパス（三値論理・**REVOKEでは直らず本体修正必須**・実測確定）。**着手前に未確定事項5点の判断が要る**（特に #1「anon実行可を0本にするか8本許容か」、#5「migration専用関数をschema.sqlでどう表現するか」）。
2. **FR-298-08（PG17 統一）を別PRで** — `postgresql-17-pgtap` が PGDG bookworm に存在することは実測済み（1.3.4-1。16版と同一リビジョン）。残るは PG17 で `schema.sql` と既存 pgTAP 268件が通るかの実測のみ。ローカル Docker で先に確認してから CI に投げること。

### そのあと（P1本体）

2. **REQ-299** エラー分類の機械可読化 — ⚠️ **順序依存あり**。`usePostForm.ts` の日本語部分文字列マッチ（`message?.includes('投稿上限')`）を先に外さないと、DB文言の英語化で静かに壊れる
3. **REQ-300** 入力データ喪失の防止（写真・音声・長文）
4. **REQ-301** 認証フローのUX堅牢化
5. **REQ-303** カラーコントラスト — ⚠️ **2026-07-31 に実測が追加された**。`text-gray-400` 186件に加え、**`/lp` の装飾テキスト2件が実際に error になる**（比 2.49 / 1.12）。現在 LHCI で `/lp` のみ warn へ限定降格中なので、**直したら両 config の降格を削除して error に戻すこと**（要件書末尾に追記済み）
6. **REQ-304** 支援技術文言のi18n — ⚠️ REQ-293 が `public/offline.html` を4言語化済みなので分担を確認
7. **REQ-305** 初期バンドル削減 — **REQ-306 完了済みなので着手可**。削った分だけ `check-bundle-budget.mjs` の `ROUTE_BUDGETS` と `SHARED_CHUNK_BUDGET`、`.size-limit.json` の閾値も**必ず同じだけ下げる**（FR-306-08。削減分を次の余裕にしない）
8. **REQ-307** 地図描画・再レンダー最適化 — ⚠️ `DrawerMenu` の閉状態DOMは **REQ-302 が既に対応済み**なので二重実装しないこと
9. **REQ-308** ページング・仮想化 — REQ-307 を先に
10. **REQ-309** Edge Function共通化・堅牢化
11. **REQ-311** E2Eとハンドラテスト
    - ⚠️ 既存の「handler テスト」3本は **`index.ts` をテキストとして読む正規表現テスト**でHTTPステータスを見ていない。雛形にするなら `notify-ai-anomaly` / `enrich-place`（実際に `handleRequest` を呼ぶ形）を使うこと
    - **カバレッジの旧閾値 65/50/50/70 の回収先はここ**（現在は実測ベースの 60/47/51/63）

### P2

12. **REQ-313** 状態同期の信頼性
13. **REQ-314** 定義の単一化とデッドコード整理 — ⚠️ bbox判定の統一は **REQ-294 で実施済み**
14. **REQ-315** 小規模UX・運用衛生 — ⚠️ `/dashboard` の h1 は**本REQが正本**
