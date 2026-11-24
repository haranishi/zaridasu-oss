# REQ-205: LP（/lp）の劣化時堅牢性・社会的証明・FAQ重複の改善

## 背景

LP `/lp` は広告・SNS流入の受け皿（REQ-176 SC-176-01）であり、JS無効・低速回線・チャンクロード失敗といった劣化環境でも最低限の価値訴求が成立すること、社会的証明（実績数値）が逆効果にならないこと、SEOの観点で `/about` とFAQが重複しないこと（NFR-176-15）が求められる。LPは全面クライアントコンポーネント（`src/views/LandingPage.tsx:1` `'use client'`）で、出現アニメーションを `IntersectionObserver` で制御している。

本REQは、LPの「壊れ方」に関する堅牢性3点をまとめて改善する。

## 現状の問題

### (1) JS劣化時にヒーロー以外の全セクションが永続非表示
- `.lp-reveal { opacity: 0 }`（`src/app/globals.css:330-335`）が初期状態で**不可視**であり、可視化は `.is-in` クラス付与に依存する。`.is-in` を付けるのは `src/views/LandingPage.tsx:96-126`（`useRevealRoot`）の `IntersectionObserver` のみ。
- したがって **JS が動かない/間に合わない場合に `.lp-reveal` 要素が永続的に非表示**になる。該当はヒーロー以外のほぼ全セクション（課題共感 / 特徴 / 使い方 / 実績 / FAQ / 最終CTA）。`src/views/LandingPage.tsx` の `.lp-reveal` は SSR 出力 HTML 上で多数（`SectionHeading` ×5 ＋ ループ展開された問題3件・特徴4件・ステップ3件・統計・最終CTA等で 20件超）描画され、これらが丸ごと消える。
  - ※ヒーローのコピー/CTA（`lp-hero-in`、`globals.css:350`）は CSS アニメーション `forwards` で最終的に可視化されるため、ヒーローのみは劣化時も表示される（JS無効でも CSS animation は走る）。問題は `.lp-reveal` 配下。
- 劣化が起きるのは: JS無効ブラウザ、ハイドレーション失敗、`IntersectionObserver` 非対応（古環境。コード上は `:106` でフォールバックするが JS 自体が失敗すれば無効）、**チャンク（JSバンドル）ロード失敗**（広告クリック直後の不安定回線で起きやすい）。
- 広告LPでこれが起きると、ファーストビュー以外の本文・CTAが全滅し、被害が大きい（直帰・CV機会損失）。

### (2) 実績0件時に社会的証明が逆効果
- 実績数値は `src/app/lp/page.tsx:32-47`（`fetchLpStats`）で ISR 取得し、`null`（取得失敗）時のみ数値カードを非表示にする（`:42` の `error` 分岐 → `null`、表示側 `src/views/LandingPage.tsx:425` の `stats && (...)`）。
- しかし **`error` ではなく 0行（`count: 0`）のとき**は `{ totalPosts: 0, totalUsers: 0 }` を返し（`:43`）、LPに「集まった報告 **0** 件」「いっしょに参加している人 **0** 人」（`lp.stats.postsLabel` / `usersLabel`、`translation.json:1068-1071`）と表示される。セクション見出しは「秋田のあちこちから、報告が集まっています」（`lp.stats.title`、:1067）。
- 公開初期やデータ未投入期に **0件の実績を誇示する形**になり、社会的証明として逆効果（信頼を損なう）。「報告が集まっています」と言いながら 0 件は矛盾。

### (3) LP FAQ q7 が /about FAQ q5 と意味重複（NFR-176-15 への疑義）
- LP FAQ q7「のせた場所や自分の情報は、どう使われますか？」（`translation.json:1091` / `docs/lp-copy.md` ⑥ Q7）。
- /about FAQ q5「ザリダスに投稿した情報はどのように使われますか？」（`translation.json:512` 付近、回答も「分布調査・生態系保全研究・行政の外来種対策…個人を特定できる情報は収集していません」でほぼ同義）。
- 両ページとも `FAQPage` JSON-LD を出力する: LP は `src/app/lp/page.tsx:66-75`（q1〜q7）、/about は `src/app/about/page.tsx:22-29`（q1〜q5）。
- 同一サイト内で**意味的に重複する Q&A を2つの URL が FAQPage 構造化データで主張**するのは、REQ-176 NFR-176-15「/about と質問が重複しない」に反し、検索エンジンに対し冗長/競合する。LP側の q7 はデータ利用に踏み込みすぎており、LPは「参加前の不安解消」に特化すべき（`docs/lp-copy.md` ⑥ 方針）。

## 目的

LPが劣化環境でも本文・CTAを表示できるようにし、実績数値が逆効果になる0件表示を防ぎ、LP FAQ を /about と重複しない「プライバシーの不安解消」特化の問いへ変更して NFR-176-15 を満たす。

## 要件

### 機能要件

- [ ] FR-205-01（劣化時フォールバック表示）: `.lp-reveal` の初期 `opacity: 0` を「JSが有効でアニメーションを実行できるときのみ」適用する。方式は以下のいずれかを実装時に採用:
  - (a) ルート要素に JS でゲートクラス（例: `.lp-js-ready`）を付与し、`.lp-js-ready .lp-reveal { opacity: 0; ... }` のように**ゲートクラス配下でのみ初期非表示**にする（クラス未付与＝JS未稼働では可視）。
  - (b) `<noscript>` で `.lp-reveal { opacity: 1 !important; transform: none !important; }` を上書きする（JS無効時の救済。ただしチャンクロード失敗は救えないため (a) を優先）。
  - 推奨は (a)（JS無効・ハイドレーション失敗・チャンク失敗のすべてを救える）。
- [ ] FR-205-02（救済の網羅）: FR-205-01 の方式は、JS無効/`IntersectionObserver` 既存フォールバック（`LandingPage.tsx:106-108`）/チャンクロード失敗のいずれでも、課題共感〜最終CTAの全セクションが最終的に可視になることを保証する。
- [ ] FR-205-03（0件で数値カード非表示）: `fetchLpStats`（`src/app/lp/page.tsx:32-47`）またはその利用側で、`totalPosts === 0`（あるいは社会的証明として弱い閾値未満。閾値は実装時に決定し記録）のときは `null` を返す/数値カードを描画しない。「0件」表示を発生させない。
- [ ] FR-205-04（0件時の見出し整合）: 数値カード非表示時、実績セクションの見出し「報告が集まっています」が矛盾しないよう、運営表記（`lp.stats.operator`）のみ残す等で破綻しない表示にする（既存 `LandingPage.tsx:445-454` のエリア・運営表記は残る構造を踏襲）。
- [ ] FR-205-05（FAQ q7 のプライバシー特化リライト）: LP FAQ q7 を /about q5 と重複しない「プライバシー/位置情報の安心」に焦点化した問いへ文言変更する（例: 「のせた場所が、他の人に正確にバレませんか？」等、不安解消の問い）。`docs/lp-copy.md` ⑥ を更新し、`lp.faq.q7` / `lp.faq.a7`（必要なら `a7Link`）を ja/en/ko/zh で改訂する。
- [ ] FR-205-06（重複解消の確認手段）: LP（`page.tsx` の FAQPage、q1〜q7）と /about（q1〜q5）の FAQPage JSON-LD の質問文が意味的に重複しないことを、レビュー観点として明記する。

### 非機能要件

- [ ] NFR-205-01: FR-205-01 のフォールバックは、reduced-motion 時の既存挙動（`LandingPage.tsx:105-108` で即 `.is-in` 付与）と矛盾しないこと。
- [ ] NFR-205-02: 改訂する `lp.faq.q7/a7` は ja/en/ko/zh で同一構造を維持し `npm run i18n:check`（REQ-114）に通る。

## 受入条件

- [ ] AC-01（JS無効）: ブラウザのJSを無効化して `/lp` を開くと、課題共感・特徴・使い方・実績・FAQ・最終CTAの各セクション本文が表示される（`.lp-reveal` が不可視のまま残らない）。
- [ ] AC-02（チャンク失敗の擬似）: ハイドレーション/チャンクが適用されない状態（例: 該当JSのブロック）でも、上記セクションが可視である。
- [ ] AC-03（0件）: `fetchLpStats` が `{ totalPosts: 0, totalUsers: 0 }` 相当を返すケースで、LPに「0 件」「0 人」の数値カードが描画されない（ユニットテスト or レンダリングテストで確認）。
- [ ] AC-04（通常データ）: `totalPosts > 0`（閾値以上）のときは従来どおり数値カードが表示される（リグレッションが無い）。
- [ ] AC-05（FAQ重複解消）: LP FAQ q7 の質問文が /about q5「ザリダスに投稿した情報はどのように使われますか？」と意味的に重複しない文言になっており、4ロケールで更新済み。`npm run i18n:check` が成功する。
- [ ] AC-06（JSON-LD）: `/lp` と `/about` のビルドHTMLの FAQPage `mainEntity` を突き合わせ、データ利用に関する同義の質問が両方に出力されていない。

## 影響範囲

- `src/app/globals.css`（`.lp-reveal` の初期非表示ゲート、`<noscript>` 上書き採用時の追加）
- `src/views/LandingPage.tsx`（ゲートクラス付与、0件時の描画分岐の整合）
- `src/app/lp/page.tsx`（`fetchLpStats` の 0件 → null 判定）
- `src/locales/{ja,en,ko,zh}/translation.json`（`lp.faq.q7/a7`）
- `docs/lp-copy.md`（⑥ FAQ Q7 の改訂）
- DB・RLS変更なし（集計クエリの返却判定のみ）。

## 優先度

- **緊急度**: Medium / **重要度**: Medium
- **理由**: (1) は劣化時にLP本文がほぼ全滅する重大な堅牢性欠陥だが、正常系では表示されるため緊急度は Medium。(2)(3) は信頼性・SEO品質の問題。いずれも広告着地点としての品質に直結し、修正はLP/CSS/集計判定/ロケールに閉じ DB 変更なしでリスクは低い。
