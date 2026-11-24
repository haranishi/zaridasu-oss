# REQ-236: SNSシェア導線の強化（Web Share API・UTM・i18n・計測）＋投稿の自動SNS告知

## 背景
ザリダスのような「珍しい生きものを見つけた」体験はシェアと相性が良く、SNS 拡散が新規参加者の主要な獲得経路になりうる。Obsidian メモ（`SNS台本術/CTA・締め・エンゲージメント設計.md`：2026 のアルゴリズム重みは 完視聴 > **シェア(DM送信)** > 保存 > コメント > いいね、`業務自動化/SNS API 深掘り（Instagram・TikTok 料金・できること・審査）.md`・`Zernio複数SNS同時投稿GASの導入フロー.md`：Late/Zernio 等の集約 API は2アカウント永久無料・審査肩代わり）を踏まえる。

ザリダスには**既に X / LINE のシェアボタンが実装済み**（`src/components/features/posts/LikeShareSection.tsx`）だが、(1) モバイルで最も強い「DM送信」に届く Web Share API が無い、(2) シェア文言が日本語ハードコードで i18n 外、(3) 流入を計測する UTM が無い、(4) 運営からの自動告知が無い、という伸びしろがある。本 REQ は「新設」ではなく**既存シェアの強化＋運営自動告知の新設**である。

## 現状の問題
（ファイルパス:行番号つき）

### 1. Web Share API（`navigator.share`）未対応＝モバイル最強の「DM送信」導線が無い
- シェアは `LikeShareSection.tsx` の X（`:95-107`、`https://twitter.com/intent/tweet`）と LINE（`:108-120`、`https://social-plugins.line.me/lineit/share`）の2つの `<a>` リンクのみ。
- `grep -rn "navigator.share" src` は**ヒット無し**。モバイルのネイティブ共有シート（Instagram DM・メッセージ・各種アプリ）に渡せず、アルゴリズム上最も新規リーチに効く「DM送信」を取りこぼしている。

### 2. シェア文言が日本語ハードコードで i18n 外
- X 共有テキストは `LikeShareSection.tsx:96` で `` `${species?.label ?? 'ザリガニ'}の${infoType?.label ?? ''}情報（秋田県${post.municipality ?? ''}）` `` と**日本語直書き**（フォールバック `'ザリガニ'` も日本語）。en/ko/zh ユーザーがシェアすると日本語の定型文になる。`src/locales/*/translation.json` に share 文言キーが無い。

### 3. シェア URL に UTM が無く、SNS 流入を GA4 で帰属できない
- X（`:96`）も LINE（`:109`）も `encodeURIComponent(window.location.href)` を**そのまま**渡しており、`utm_source`/`utm_medium`/`utm_campaign` が無い。LP では `from=lp`＋UTM で流入計測している（REQ-182）のに、投稿シェア経由の流入は区別できない。

### 4. シェア操作が計測されていない
- いいね（`src/hooks/useLike.ts`）にも `dataLayer`/`gtag` 連携は無く（`grep` ヒット無し）、シェアクリックの GA4 イベントも無い。どの投稿・どの SNS が拡散に効いたか分からない（REQ-232 のイベント設計と接続すべき）。

### 5. 「保存／リンクコピー」導線が無い
- アルゴリズム2位の「保存」や、DM で送る前段の「リンクコピー」導線が無く、シェアの選択肢が X/LINE の2つに限られる。

### 6. 運営からの自動 SNS 告知が無い
- 注目投稿・マイルストーン（珍しい種の同定、観察数の節目）を運営アカウントから自動告知する仕組みが無い（リポジトリに該当コード・ワークフロー無し）。OGP は実装済み（`src/app/layout.tsx` の openGraph/twitter、動的 OG は `/api/og`）だが活用されていない。OG 画像が投稿ごとに最適化されているかは REQ-027（動的 OG）に依存。

## 目的
既存の X/LINE シェアを土台に、(1) Web Share API・UTM・i18n・計測を足してユーザーシェアの効果と到達を最大化し、(2) 運営の自動 SNS 告知で継続的なオーガニック流入を作る。市民科学の「自慢したくなる」体験を新規参加に転換する。

## 要件

### 機能要件
- [ ] FR-236-01: `LikeShareSection.tsx` に Web Share API（`navigator.share`）対応の共有ボタンを追加する。`navigator.share` 非対応環境では既存の X/LINE リンク（`:95-120`）にフォールバックする（プログレッシブエンハンスメント）。共有データはタイトル・テキスト・URL を含める。
- [ ] FR-236-02: シェア文言を i18n 化する。`:96` の日本語ハードコードを `src/locales/*/translation.json` のキー（種ラベル・情報種別・地域名を変数で差し込む）へ置換し、4言語で自然な文面にする（`i18n:check` を通す）。
- [ ] FR-236-03: 全シェア URL に UTM を付与する（例 `utm_source=x|line|web_share`・`utm_medium=social`・`utm_campaign=post_share`）。`window.location.href`（`:96,109`）をそのまま使わず、UTM 付き正規 URL を生成するユーティリティを用意し、REQ-182/232 の attribution と整合させる。
- [ ] FR-236-04: シェアクリック／共有実行を GA4 イベント（例 `share`、パラメータに `method`=x/line/web_share、`content_id`=投稿 ID）で計測する。実装は REQ-232 の汎用 `trackEvent`/`dataLayer` パターンに乗せる（PII を含めない）。
- [ ] FR-236-05: 「リンクをコピー」導線を追加する（`navigator.clipboard`、UTM 付き URL、コピー完了トースト）。任意で「保存」相当（ブックマーク）を検討。
- [ ] FR-236-06: 運営の自動 SNS 告知を新設する。注目投稿（例：AI 高精度同定・珍しい種・新地域の初観察）やマイルストーンを、集約 API（Late 等）へ**サーバー側 fetch**（Vercel Route Handler または Supabase Edge Function）で OGP 付き投稿する。投稿先 URL には UTM を付与し、`x-request-id` 等で二重投稿を防止する。対象選定基準（しきい値）と承認フロー（全自動か運営確認か）を本 REQ で定義する。

### 非機能要件
- [ ] NFR-236-01: 自動告知の API キー／トークンはサーバー専用（`NEXT_PUBLIC_` 厳禁、REQ-211/シークレット方針）。クライアントに露出しないこと。
- [ ] NFR-236-02: 自動告知はレート制限・冪等性（同一投稿を重複告知しない）・失敗時リトライ上限（REQ-218 の暴走防止）を備えること。
- [ ] NFR-236-03: Web Share API・clipboard はモバイル/デスクトップ・各ブラウザで非対応時に安全にフォールバックし、二次例外を出さないこと。
- [ ] NFR-236-04: シェア導線追加で投稿詳細（`/post/[id]`）のバンドル／LCP を悪化させないこと（REQ-191 等のバジェット内）。

## 受入条件
- [ ] AC-01: モバイルの対応ブラウザで「共有」を押すとネイティブ共有シートが開き、非対応環境では X/LINE リンクが従来どおり機能する。
- [ ] AC-02: en/ko/zh に切替えた状態でシェアすると、その言語の文面になる（`i18n:check` 通過）。
- [ ] AC-03: シェア URL に UTM が付与され、GA4 で `utm_source`/`utm_medium` 別の流入が確認できる。
- [ ] AC-04: シェア操作で GA4 `share` イベントが発火し、`method` と投稿 ID（非 PII）が記録される。
- [ ] AC-05: 「リンクをコピー」でクリップボードに UTM 付き URL が入り、完了フィードバックが出る。
- [ ] AC-06: 自動告知が対象投稿を OGP 付きで運営 SNS に投稿し、同一投稿が二重投稿されない。トークンはクライアントに露出しない。

## 影響範囲
- `src/components/features/posts/LikeShareSection.tsx`（Web Share・UTM・i18n・計測・コピー）
- `src/views/DetailPage.tsx`（シェアセクションの配置）、`src/hooks/useLike.ts`（計測連携の余地）
- `src/lib/lpAnalytics.ts` 等の計測ユーティリティ（`share` イベント、REQ-232 と共通化）
- `src/locales/*/translation.json`（シェア文言4言語）
- 新規：自動告知の Route Handler / Edge Function、運営 SNS 連携設定
- 関連REQ: REQ-027（動的OG画像）・REQ-181（LP OGP）・REQ-182（attribution）・REQ-232（GA4イベント）・REQ-211（シークレット）・REQ-218（コスト/暴走防止）

## 優先度
- **緊急度**: Low / **重要度**: Medium
- **理由**: 既存シェアが動作しているため緊急ではないが、Web Share（DM送信）・UTM・計測・自動告知は「拡散→新規参加」の経路を低コストで強化でき、市民科学のデータ母数拡大（卒研の価値）に効く。多くは既存コンポーネントの強化で、リスクは低い。
