# REQ-243: 位置情報プライバシー — 生座標の anon 露出とデータセット粗化バイパスの是正

## 背景
ザリダスは外来生物の目撃地点を地図・公開データセットで共有する市民科学 PF である。REQ-230 は公開データセット（`/dataset/*.csv|.geojson`）の座標を小数第 3 位（≒111m）へ**不可逆に粗化**し、「自宅・私有地・希少種の採集地点の特定を防ぐ」ことを明示の脅威モデルとしている。しかし監査の結果、この粗化は**エクスポート経路のみの保護**であり、公開 anon キーで PostgREST（`posts` テーブル等）を直接叩けば**生精度の座標が一括取得できる**ため、設計意図が実効化していないことが判明した。投稿本体に加え、定点観察サイト・調査依頼テーブルも生座標＋`user_id`＋自由文で公開読み取り可能になっている。

## 現状の問題
（ファイルパス:行番号つき）

### 1.（Medium）承認済み投稿の生座標（≒1cm）が anon に露出し、データセット粗化を迂回できる
- `supabase/schema.sql:35-36`（`posts.lat/lng DECIMAL(10,7)` ≈1cm）・`:59`（`accuracy`）。公開ポリシー `moderated_read`（`:757-764`）は `USING (status='approved' OR 本人 OR admin)` で **`TO` 句が無く anon にも適用**、かつ**全列を返す**（列剥奪は `reporter_ip` のみ＝`20260616000005`）。
- 制御側の粗化は `src/app/dataset/zaridasu.csv/route.ts:28,37-41`（`COORD_DECIMALS=3` / `coarsenCoord`）だが、これは CSV/GeoJSON エクスポートにしか効かない。
- **バイパス**: 攻撃者が公開 anon キーで `GET /rest/v1/posts?select=lat,lng,accuracy,species&status=eq.approved` を叩けば、全承認投稿の**正確座標＋GPS精度を一括取得**できる。地図表示のため生座標は元々全訪問者へ送られており、粗化は「一括ハーベスト抑止」の意図だが直叩きで無効化される。
- これは PF 自身の脅威モデル（`zaridasu.csv/route.ts:22-28`）と正面から矛盾する。

### 2.（Medium）`survey_requests` / `survey_sites` が生座標＋`user_id`＋自由文で世界公開
- `supabase/schema.sql:1588-1608`（`survey_requests`: `lat/lng DECIMAL(10,7)` at `:1592-1593`、`user_id`、自由文 `reason`。ポリシー `survey_requests_viewable ... USING (true)` at `:1608`）。
- `supabase/schema.sql:1929-1947`（`survey_sites`: `user_id` at `:1931`、`name` at `:1932`、`lat/lng DECIMAL(10,7)`。ポリシー `survey_sites_select_all ... TO anon, authenticated USING (true)`）。
- `survey_sites` はユーザー個人の定点観察地点（**自宅近傍の蓋然性**）、`survey_requests` は正確座標＋自由文の依頼で、いずれも `user_id` に紐づく。M1 と同じ座標プライバシー問題だが、`USING(true)` はより「公開地図のための設計」とは言い難い。

### 3.（Low・現状は潜在）投稿編集の写真追加で EXIF/GPS が除去されない
- 通常投稿は `usePostForm` → `processImage`（canvas 再エンコード）で **EXIF を確実に除去**して upload する。一方、編集での写真追加 `src/utils/storage.ts:13-20`（`uploadPhoto`、呼出 `src/hooks/useEditPost.ts:61`）は**生ファイルをそのまま upload**し、EXIF（GPS 含む）を残す。
- `post-photos` は `public_read_photos USING (bucket_id='post-photos')` で誰でも閲覧可能なため、GPS 入り写真を追加すると撮影地点の正確座標が公開ストレージに残る。
- 現状はアップロードパスが `${postId}/` 始まりで、ストレージ INSERT ポリシー `authenticated_upload`（`(storage.foldername(name))[1] = auth.uid()::text`、`20260513000007`）と**プレフィックス不一致**のため upload が RLS で失敗し `.filter(Boolean)` で握り潰される（＝今は EXIF 漏えいは顕在化せず、機能不全の潜在バグ）。将来この不整合が「修正」されると EXIF 漏えいが顕在化する。副次的に `ext = file.name.split('.').pop()` を無検証でキーに使う点（`..` 混入余地）も残る。

## 目的
「公開座標は粗化して提供し、正確座標は所有者・管理者（および正式合意のある研究利用）に限定する」という REQ-230 の設計意図を、**エクスポートだけでなく DB 境界（RLS/列/ビュー）で一貫して実効化**する。あわせて定点・依頼テーブルの座標/PII 露出を絞り、編集経路の EXIF 除去を本体経路と統一する。

> **方針決定（2026-07-03・ユーザー確定）**: ブランケット粗化ではなく、**管理者が種単位・記録単位で「位置の公開範囲」を管理できる**方式を採る。各記録は公開レベル `precise`（生精度も公開）／`coarsened`（粗化 ≒111m のみ）／`hidden`（座標を出さない）を持ち、**所有者・管理者は常に正確座標にアクセス可**。既定は種ごとに設定（現状の特定外来生物 2 種＝公開/粗化）し、**機微な種（例: 絶滅危惧種）や個別に機微な記録は管理者が `hidden` に切り替えられる**。対象種は将来増え得る（希少種・保全上機微な記録）ため、汎用の公開レベルを DB で強制する。

## 要件

### 機能要件
- [ ] FR-243-01: 各投稿に**公開レベル**（`precise` / `coarsened` / `hidden`）を持たせ、anon への座標配信を DB（RLS/セキュリティバリアビュー/列 GRANT）で強制する。`coarsened`＝粗化座標のみ（≒111m・生成列）、`hidden`＝座標を返さない、`precise`＝生精度も公開。生 `lat/lng` の anon 直読みは常に塞ぎ（`reporter_ip` と同じ列保護技法）、anon は公開レベルに応じた投影のみ参照できる。**所有者・管理者は公開レベルに関わらず常に正確座標にアクセス可**。
- [ ] FR-243-01b: **管理者が種単位・記録単位で公開レベルを管理**できるようにする。(a) 種ごとの既定公開レベル（例: 特定外来生物＝`coarsened`／機微・希少種＝`hidden`）を持つ設定、(b) 個別記録を管理者が上書きできる仕組み、(c) 管理 UI（`src/views/admin/AdminPostsPage.tsx` もしくは種設定画面）からの設定・変更。既定は保守的（不明・機微は `coarsened` 以下）にし、明示的に `precise` にした種/記録のみ生精度を公開する。
- [ ] FR-243-02: `survey_requests` / `survey_sites` の公開読み取りから**生座標と `user_id` を除外**する（粗化座標のみ・匿名化した投影を anon に提供）。正確座標・所有者情報は所有者/管理者限定にする。`USING(true)` を必要最小の投影/ロールに絞る。
- [ ] FR-243-03: 公開データセット（REQ-230）と DB 公開面の**座標精度ポリシーを一致**させる。エクスポートのみ粗化・API は生、という齟齬を解消する。
- [ ] FR-243-04: 投稿編集の写真追加 `uploadPhoto` を本体経路と同じく `processImage`（EXIF 除去）に通す。アップロードパスを `${auth.uid()}/${crypto.randomUUID()}.jpg` に統一し、拡張子はホワイトリスト固定（ユーザー入力 `file.name` をキーに使わない）。これによりストレージ RLS 経路の不整合も解消する。

### 非機能要件
- [ ] NFR-243-01: 変更は正本 `schema.sql` と追補 migration の両方に反映し `schema:check` を通す。地図・エリアページ・データセットの既存表示が壊れないこと（粗化精度で地図が実用に耐えることを確認）。
- [ ] NFR-243-02: 採用した座標精度ポリシーと「正確座標の開示先」を `docs/security/`・`docs/requirements/REQ-230*`・プライバシーポリシー（`/privacy`）に明記し、実態と文書を一致させる。
- [ ] NFR-243-03: 既存の所有者・管理者機能（自分の投稿の正確位置編集、管理レビュー）は生精度を維持する。

## 受入条件
- [ ] AC-01: 公開 anon キーで `posts` を直接クエリしても、その記録の公開レベルに応じた精度しか得られない（`coarsened`＝粗化のみ／`hidden`＝座標なし）。`precise` 指定の記録のみ生精度を返す。
- [ ] AC-06: 管理者が種/記録の公開レベルを設定・変更でき、`hidden`（例: 絶滅危惧種）にした記録の座標が anon・データセット（CSV/GeoJSON）双方で出ない。種の既定公開レベルが効く。
- [ ] AC-02: anon から `survey_requests`/`survey_sites` を読んでも、生座標・`user_id` が取得できない（粗化/匿名投影のみ）。
- [ ] AC-03: エクスポート（CSV/GeoJSON）と DB 公開面の座標精度が一致し、REQ-230 の脅威モデル記述と実態が整合する。
- [ ] AC-04: 投稿編集で追加した写真から EXIF/GPS が除去され、アップロードが正規パスで成功する（RLS 不整合の解消）。
- [ ] AC-05: 所有者・管理者は従来どおり正確座標にアクセスでき、地図/エリアページが粗化後も実用的に表示される。

## 影響範囲
- `supabase/schema.sql`（`posts` の公開レベル列＋種別既定・`moderated_read`／anon 公開ビュー・`survey_requests_viewable`・`survey_sites_select_all`・列 GRANT／粗化生成列）＋対応 migration
- 管理: `src/views/admin/AdminPostsPage.tsx`（記録単位の公開レベル操作）＋種別既定の管理 UI／RPC（管理者のみ）
- `src/hooks/usePostList.ts`（select 列・精度）、`src/components/features/map/MapView.tsx`（表示精度）、`src/app/dataset/*`（公開レベル遵守）、`src/app/area/*`
- `src/utils/storage.ts`（`uploadPhoto` の EXIF 除去・パス）、`src/hooks/useEditPost.ts`
- `docs/security/`・`docs/requirements/REQ-230*`・`/privacy`
- 関連 REQ: REQ-230（オープンデータ粗化）、REQ-172（GPS 精度）、REQ-174（定点調査）、REQ-179/208（列保護）、REQ-221（ハードニング）。

## 優先度
- **緊急度**: Medium / **重要度**: High
- **理由**: 未承認データの漏えいではないが、PF が明示的に守ると宣言した「自宅・私有地の特定回避」が実態として担保できておらず、正確座標＋`user_id`＋自由文が一括ハーベスト可能。プライバシーポリシー・脅威モデルとの不整合は信頼と説明責任に直結する。ただし公開精度の決定はプロダクト判断を伴うため、緊急度は High 認可バイパス（REQ-242）の次点。
