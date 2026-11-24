# REQ-204: LP（/lp）アクセシビリティ・無限アニメーション課題の解消

## 背景

REQ-176 は WCAG 2.1 AA 準拠（NFR-176-07〜09）と `prefers-reduced-motion` 尊重（NFR-176-09）を要件としている。LP `/lp`（`src/views/LandingPage.tsx`）は、装飾性の高いデザイン（マーキー帯・浮遊オーブ・縁取りタイポ等）を採用しており、その演出が複数のWCAG基準・国際化方針に抵触している。広告・SNS流入の主デバイスはモバイル（NFR-176-11）で、バッテリー・描画負荷も実害になりやすい。

本REQは、LP固有の a11y / アニメーション課題5点をまとめて解消する。

## 現状の問題

### (1) 停止できない無限アニメーション（WCAG 2.2.2 動きの一時停止・停止・非表示）
- **マーキー帯**: `.lp-marquee-track`（`src/app/globals.css:385-389`）が `animation: lp-marquee 30s linear infinite` で**常時自動スクロール**。停止・一時停止・非表示の手段が無い。該当UIは `src/views/LandingPage.tsx:290-308`（`LpMarquee`）。5秒以上自動で動き続ける動きは WCAG 2.2.2（レベル A）違反。
- **浮遊オーブ等の常時アニメ**: `.lp-orb-a`（14s）/ `.lp-orb-b`（18s）が `infinite`（`src/app/globals.css:364-365`）。対象は `blur-3xl` の 288〜448px の大型要素（`src/views/LandingPage.tsx:252-253`）。さらにスクロールキュー `.lp-scroll-line`（1.8s infinite、`globals.css:407`）。これらは画面外（ヒーロー外へスクロール後）でも `animation-play-state` が `running` のまま稼働し続け、モバイルのバッテリー消費・メインスレッドのジャンク要因になる（REQ-176 NFR-176-02 の INP < 200ms 予算を圧迫）。
- 補足: `prefers-reduced-motion: reduce` 時は `globals.css:63-69` の全体ルールで `animation-iteration-count: 1` に潰れるため、reduced-motion ユーザーには停止する。しかし**動きを許容しているユーザーにも停止手段が必要**（2.2.2 は reduced-motion とは別要件）。

### (2) ラベルとアクセシブルネームの不一致（WCAG 2.5.3 Label in Name）＋ 文言直書き
- **ロゴボタン**: `src/views/LandingPage.tsx:215-218` のボタンは可視テキスト「ザリダス」（:220）を含むが、`aria-label="ページの先頭へ戻る"`（:218、日本語直書き）で上書きしており、アクセシブルネームに可視ラベル「ザリダス」が含まれない。音声操作（「ザリダスを選択」）が効かず WCAG 2.5.3 違反。さらに `aria-label` がi18n化されず日本語ハードコード（en/ko/zh で英語/韓国語/中国語UIでも日本語が読み上げられる）。
- **nav の aria-label**: `src/views/LandingPage.tsx:63` の `<nav aria-label="フッター">` が日本語直書き（i18n未対応）。
- **コピーライト**: `src/views/LandingPage.tsx:68` の `<p>© ザリダス</p>` が直書き。`docs/archive/lp-copy.md` ⑧ では `lp.footer.copyright`（「© ザリダス」）キーが定義されているが、**i18n キーが未作成**（`src/locales/ja/translation.json:1107-1111` の `lp.footer` に `about/terms/privacy` はあるが `copyright` が無い）。

### (3) スキップリンクの欠如（WCAG 2.4.1 ブロックスキップ）
- LP専用ヘッダー `LpHeader`（`src/views/LandingPage.tsx:209-243`）に「本文へスキップ」リンクが無い。アプリ共通ヘッダー `src/components/layout/Header.tsx:47-52` には REQ-013 で実装済み（`href="#main-content"` + `sr-only focus:not-sr-only`）。スキップ先 `#main-content` は root layout（`src/app/layout.tsx:145`）に存在するため、LP側にリンクを足すだけで機能する。LPはヘッダー → ヒーローのCTA等まで複数のリンクがあり、キーボード/スクリーンリーダー利用者の回避手段が無い。

### (4) 低コントラスト（WCAG 1.4.3 コントラスト（最低限） 4.5:1 / 1.4.11 非テキストコントラスト 3:1）
- **セクション見出しの英ラベル**: `src/views/LandingPage.tsx:165-167` の英字ラベル（"Issue" 等）が白背景上で `text-gray-400`（約 2.8:1）。`aria-hidden="true"` だが視覚的には読めるべき装飾テキストで、視認性が低い。
- **FAQ開閉アイコン**: `src/views/LandingPage.tsx:575-580` の `Plus` アイコンが `text-gray-400`（白/`bg-gray-50` 上で約 2.4:1）。このアイコンの回転（`rotate-45`）が**開閉状態の唯一の視覚的手がかり**であり、UIコンポーネントの状態表示として 3:1 を満たすべき（1.4.11）。
- **FAQ回答リンク（ダーク時）**: `src/views/LandingPage.tsx:586-592` の回答内リンクが `text-primary-600`。ダークモード時 `dark:bg-slate-900`（FAQセクション `:554`）上で約 3.7:1 となり 4.5:1 未満。

### (5) スムーススクロールが reduced-motion を無視
- ロゴクリック時 `src/views/LandingPage.tsx:216` が `window.scrollTo({ top: 0, behavior: 'smooth' })`。CSS の `scroll-behavior` は `globals.css:68` で reduced-motion 時 `auto` に上書きされるが、**JS の `behavior: 'smooth'` 引数には CSS の抑止が効かない**。`prefers-reduced-motion: reduce` を設定したユーザーにも大きなスムーススクロールが発生し、前庭障害（vestibular）配慮の方針（NFR-176-09）に反する。

## 目的

LP `/lp` を WCAG 2.1 AA（2.2.2 / 2.4.1 / 2.5.3 / 1.4.3 / 1.4.11）に適合させ、`prefers-reduced-motion` を JS 経路でも尊重し、装飾アニメーションを画面外で停止してモバイルの負荷を下げる。あわせてLP内の直書き文言を i18n キー化し、4ロケール（ja/en/ko/zh）の構造を揃える（REQ-176 NFR-176-06）。

## 要件

### 機能要件

- [ ] FR-204-01（マーキー停止手段）: `.lp-marquee-track` のアニメーションに対し、ホバー時・フォーカス時（`:hover` / `:focus-within`、コンテナにフォーカス可能要素を置く or 一時停止トグル）で `animation-play-state: paused` を適用し、ユーザーが動きを止められるようにする（WCAG 2.2.2）。実装方式（ホバー一時停止＋停止トグルボタン等）は実装時に確定し、キーボードでも停止可能とする。
- [ ] FR-204-02（画面外で停止）: マーキー・浮遊オーブ・スクロールキュー等の `infinite` アニメーション要素に `IntersectionObserver` を用い、ビューポート外のとき `animation-play-state: paused` を付与、ビューポート内で `running` に戻す。常時稼働を避けモバイルの描画/バッテリー負荷を削減する（NFR-176-02 INP 予算保護）。
- [ ] FR-204-03（Label in Name）: ロゴボタン（`LandingPage.tsx:215-218`）のアクセシブルネームに可視テキスト「ザリダス」を含める。`aria-label` を撤廃して可視テキストをそのまま名前にする、または「ザリダス（ページの先頭へ戻る）」のように**可視ラベルを先頭に含む**i18nキーへ変更する（WCAG 2.5.3）。
- [ ] FR-204-04（aria-label の i18n化）: `nav aria-label="フッター"`（:63）・ロゴボタンの補助ラベルを `lp.*` キー化する（例: `lp.footer.navLabel`、`lp.header.logoLabel`）。日本語直書きを排除し ja/en/ko/zh に追加する。
- [ ] FR-204-05（copyright キー化）: `<p>© ザリダス</p>`（:68）を `t('lp.footer.copyright')` に置き換え、`lp.footer.copyright` キーを ja/en/ko/zh の `translation.json` に追加する（`docs/archive/lp-copy.md` ⑧ の確定値「© ザリダス」）。
- [ ] FR-204-06（スキップリンク）: `LpHeader` 先頭に `#main-content` へのスキップリンクを追加する。`src/components/layout/Header.tsx:47-52` と同じ `sr-only focus:not-sr-only` パターンを用い、ラベルは既存 `header.skipToMain` を流用（または `lp.*` に新設）。スキップ先 `#main-content`（`layout.tsx:145`）は既存のため変更不要。
- [ ] FR-204-07（コントラスト引き上げ）: 以下を 4.5:1（テキスト）/ 3:1（UI部品）以上に引き上げる:
  - セクション見出し英ラベル（:165-167）を `text-gray-500`（白背景 4.6:1）相当へ。
  - FAQ Plus アイコン（:575-580）を `text-gray-500`/`text-gray-600` 相当へ（状態手がかりとして 3:1 以上）。
  - FAQ 回答リンク（:586-592）のダーク時を `dark:text-primary-400`（赤系の明るいトーン）等で `dark:bg-slate-900` 上 4.5:1 以上にする。
- [ ] FR-204-08（reduced-motion でのスクロール分岐）: ロゴクリックのスクロール（:216）を `window.matchMedia('(prefers-reduced-motion: reduce)').matches` で分岐し、reduce 時は `behavior: 'auto'`（即時）、それ以外は `'smooth'` とする。

### 非機能要件

- [ ] NFR-204-01: 追加する4ロケールキー（`lp.footer.copyright`・`lp.footer.navLabel`・`lp.header.logoLabel` 等）は ja/en/ko/zh で同一構造とし、`npm run i18n:check`（REQ-114）に通る。
- [ ] NFR-204-02: 既存の `prefers-reduced-motion` 全体ルール（`globals.css:63-69`）との二重定義で矛盾が生じないこと（CSS の play-state 制御は reduced-motion 時は既存ルールで停止する前提で整合させる）。

## 受入条件

- [ ] AC-01: マウス/キーボードでマーキー帯にホバー/フォーカスすると自動スクロールが一時停止する（再現手順つきで確認）。
- [ ] AC-02: ヒーローを画面外へスクロールした状態で、浮遊オーブ・マーキー要素の `animation-play-state` が `paused` になる（DevTools で確認）。
- [ ] AC-03: ロゴボタンのアクセシブルネームに「ザリダス」が含まれる（axe / ブラウザのアクセシビリティツリーで確認）。WCAG 2.5.3 違反が解消する。
- [ ] AC-04: LP上に日本語直書きの `aria-label`（"フッター" 等）と `© ザリダス` リテラルが存在せず、すべて `t('lp.*')` 経由になっている（grep で直書き不在を確認）。
- [ ] AC-05: en/ko/zh ロケールでLPを表示したとき、フッターのコピーライト・nav ラベル・ロゴ補助ラベルが各言語の値になる。`npm run i18n:check` が成功する。
- [ ] AC-06: `LpHeader` 直後に Tab を送るとスキップリンクが可視化され、Enter で `#main-content` へフォーカス移動する。
- [ ] AC-07: セクション見出し英ラベル・FAQ Plus アイコン・FAQ回答リンク（ダーク）のコントラスト比が、自動チェック（axe など）または手計測で各基準（4.5:1 / 3:1）を満たす。
- [ ] AC-08: OS/ブラウザで「視差効果を減らす（reduce motion）」を有効にしてロゴをクリックすると、スムーススクロールせず即座に先頭へ移動する。
- [ ] AC-09: `vitest-axe`（または Playwright + axe）でLP主要セクションに重大（critical/serious）な a11y 違反が検出されない。

## 影響範囲

- `src/views/LandingPage.tsx`（LpMarquee / LpHeader / SectionHeading / LpFaq / フッター / オーブの IO 連携）
- `src/app/globals.css`（`.lp-marquee-track` の hover/focus pause、IO 付与用クラス、play-state 制御）
- `src/locales/{ja,en,ko,zh}/translation.json`（`lp.footer.copyright` ほか新規キー）
- 既存の root layout `#main-content`（変更不要・参照のみ）
- DB・API変更なし。

## 優先度

- **緊急度**: Medium / **重要度**: Medium
- **理由**: いずれも WCAG 2.1 AA の明確な違反（2.2.2 / 2.4.1 / 2.5.3 / 1.4.3 / 1.4.11）で、REQ-176 の a11y NFR に反する。公開済みの広告着地点として、市民科学アプリ（子ども・高齢者含む幅広い住民が対象）の包摂性に直結する。一方で機能不全ではなく体験品質の問題のため緊急度は Medium。修正はLPコンポーネント/CSS/ロケールに閉じ、DB変更なしでリスクは低い。
