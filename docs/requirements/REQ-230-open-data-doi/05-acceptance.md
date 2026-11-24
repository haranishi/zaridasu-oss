## 受入条件

- [ ] AC-01: `/dataset` 公開ページが存在し（ログイン不要・`robots` で index 許可・`sitemap.ts` に追加）、データ概要・収録項目・**含めない PII**・ライセンス・ダウンロードリンク・DO/引用・収録期間/件数/最終更新が掲示されている。
- [ ] AC-02: 公開ダウンロードとして **CSV と GeoJSON** が安定 URL から取得でき（ログイン不要）、`status='approved'` のデータのみを含む。GeoJSON は RFC 7946 準拠（`[lng, lat]`）で GIS ツールに読み込める。
- [ ] AC-03: 公開データの**座標が粗化**されており（生 lat/lng がそのまま出ていない）、粗化レベルが `/dataset` ページとファイル内に明記されている。`accuracy`・`user_id`・`reporter_ip`・メール等の PII が公開物に**含まれていない**。
- [ ] AC-04: 公開データのライセンス（CC BY 4.0 等）が確定し、`/dataset` に**ライセンス名・URL・推奨帰属表示**が掲示されている。`src/views/TermsPage.tsx` に投稿者からの公開許諾、`src/views/PrivacyPage.tsx` に「公開されるのは匿名化・粗化済みで PII を含まない」旨が反映されている。確定ライセンスが REQ-229 の `Dataset.license` に供給されている（または供給する接続が明記）。
- [ ] AC-05: データセットのスナップショットが OSF または Zenodo に登録され **DOI が発行**され、`/dataset` ページに DOI と**引用方法（citation）**が掲示されている。更新時の versioning 方針が runbook に記録されている。
- [ ] AC-06: 研究者向け絞り込み（`approved` 固定・`species`/`municipality`/期間・形式 csv/geojson）が機能し、`myOnly` 等のログイン依存軸は公開版に含まれない。既存ダッシュボードのログイン版エクスポート（`CSVExportSection.tsx`）は本人用途として従来どおり動作する（回帰なし）。
- [ ] AC-07: `/dataset` にデータの限界（市民科学・非悉皆・観察努力の偏り・座標粗化・approved のみ）が caveats として明記されている。
- [ ] AC-08: 配布物生成と DOI 反映の runbook が `docs/runbooks/` にあり、API トークン等の秘密値が本書・runbook・公開物・ログに平文で残っていない。`npm run build` / 型チェック / 既存テストが green で本 REQ 由来の回帰が無い。
