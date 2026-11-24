## 4. 既知の制約

### メール登録では `from` が失われやすい

`from` は `sessionStorage`（キー `zaridasu:authFrom`・TTL 30 分）に退避される。
メール確認リンクは**別タブ／別アプリで開かれる**ことが多く、その場合 sessionStorage は
引き継がれないため、`AuthCallbackPage` に到達した時点で `from` が読めない（REQ-182 FR-182-05）。

**結果として、Google OAuth（同一タブでリダイレクト往復する）だけが確実に帰属する。**
この非対称性を知らずに集計すると、OAuth 経路の施策が過大評価される。

- 集計時は「メール登録の流入元不明は一定割合出る」前提で読む
- 施策の CTA は Google ログインを優先的に見せると帰属精度が上がる
- 実装で解決する場合は確認メールのリダイレクト URL に `from` を引き継ぐ（REQ-289 FR-289-05・未実施）

### `utm_content` を付け忘れた施策は、後から分離できない

媒体（`utm_source`）までは分かるが、どのクリエイティブが効いたかは永久に分からない。
`content` は `buildCampaignUrl` の任意引数だが、**外部施策では必ず指定する**。

---

## 5. 関連

- 要件: `docs/requirements/REQ-289-acquisition-attribution-baseline.md`
- 実装: `src/lib/acquisition.ts`（台帳・正規化）/ `src/lib/shareUtm.ts`（URL 生成）
- テスト: `src/lib/__tests__/acquisition.test.ts`
- 既存の帰属設計: REQ-176（LP CTA）/ REQ-182（TTL・削除タイミング）/ REQ-232（trackEvent 一本化）
- KPI の全体像: Obsidian `[[08_ザリダス_KGI・部門別KPI・実行計画]]` / `[[11_ザリダス_マーケティング全体構造]]`
