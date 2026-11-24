# REQ-182: LP経由サインアップ（主CV）のアトリビューション欠落の修正

## 背景

REQ-176 の最重要KPIは「LP経由の新規会員登録」（主CV）であり、計測経路は FR-176-08 / US-176-02 AC-2,3 で「`lp_cta_signup` → `sign_up`（GA4）」「LP経由の登録を `?from=lp` で識別」と定義されている。LP の CTA は `/?auth=signup&from=lp`（`src/views/LandingPage.tsx:20`）へ遷移し、ルート画面で AuthModal をサインアップモードで自動起動する。

`from=lp` のアトリビューションは、CTAクリック → 登録完了までクエリが失われる（リダイレクト・別ページ遷移を挟む）ため、`sessionStorage`（キー `zaridasu:authFrom`）にバトンを渡す設計になっている。受け渡しの起点は `src/app/(home)/HomeInteractive.tsx:147-165` で、`from` を `sessionStorage` に退避し URL からクエリを除去する。

## 現状の問題

CV確定イベント `sign_up` を push する箇所が `zaridasu:authFrom` を読まないため、主CVのアトリビューションが成立していない。

- **`sessionStorage` を消費するのはメール経路の "途中" イベントのみ**: `zaridasu:authFrom` を読み取り `from` を付与しているのは `src/components/modals/AuthModal.tsx:166-178` の `sign_up_initiated`（method: email）だけ。これは「確認メール送信」時点のイベントであり、**登録完了（CV）ではない**。
  ```ts
  // AuthModal.tsx:168-177
  let authFrom: string | null = null
  try {
    authFrom = window.sessionStorage.getItem('zaridasu:authFrom')
    if (authFrom) window.sessionStorage.removeItem('zaridasu:authFrom')
  } catch { /* noop */ }
  window.dataLayer?.push({ event: 'sign_up_initiated', method: 'email', ...(authFrom ? { from: authFrom } : {}) })
  ```
- **CV確定イベント `sign_up` は authFrom を読まない**: `sign_up` は `src/views/AuthCallbackPage.tsx` の3箇所で push される。いずれも `from` を付与していない:
  - `:53-56` メール確認完了（`SIGNED_IN` かつ `isEmailConfirmation`）→ `{ event: 'sign_up', method: 'email' }`
  - `:64-67` Google OAuth（`SIGNED_IN` かつ新規）→ `{ event: 'sign_up', method: 'google' }`
  - `:76-79` Google OAuth（`INITIAL_SESSION` かつ新規）→ `{ event: 'sign_up', method: 'google' }`
- **Google経路は完全に計測不能**: LPコピーは「メールアドレスか **Googleアカウント** だけ」（`docs/archive/lp-copy.md` FAQ a2）とGoogle登録を主たる選択肢として案内している。しかしGoogle OAuthは `AuthModal` の `sign_up_initiated` を一切通らず（OAuthはモーダル内 `signInWithGoogle` で即リダイレクト、`src/components/modals/AuthModal.tsx:7`）、`AuthCallbackPage` の `sign_up`（method: google）も `from` を読まない。よって**主経路であるGoogle登録のLP由来CVが0件としてしか観測できない**。
- **メール経路も from が `sign_up` まで届かない**: メール経路では `sign_up_initiated` 時に `authFrom` を読んで **同時に削除**（`AuthModal.tsx:171`）してしまう。確認メールのリンクは別タブ/別セッションで開かれ得るうえ、仮に同一タブでも `sign_up`（AuthCallbackPage:53）時点では既に `sessionStorage` から消えており `from` を復元できない。CV（`sign_up`）に `from=lp` が付かない。
- **未消費キーの残留リスク**: ユーザーが LP CTA を踏んで `zaridasu:authFrom='lp'` がセットされた後、登録せず・メール経路にも進まず離脱すると、同一タブの `sessionStorage` にキーが残る。その後（数日後など）同じタブで別経路から登録すると、残留した `from=lp` が誤って引き継がれ**誤帰属**する恐れがある（TTLや確実な消費がないため）。

> 制約（仕様上計測不能な範囲）: メール確認リンクは多くの場合**別タブ/別端末**で開かれる。`sessionStorage` はタブ（ブラウジングコンテキスト）スコープのため、別タブで開かれたメール確認の `sign_up` は原理的に `from` を復元できない。一方 OAuth は同一タブ内でリダイレクト → コールバックに戻るため、`sessionStorage` は保持される（OAuth経路は救済可能）。

## 目的

主CV（LP経由の `sign_up`）に `from=lp` を確実に付与し、GA4 で「LP経由の新規登録」が経路（email / google）別に判別できる状態にする。特に主経路である **Google OAuth 登録**のアトリビューションを最優先で成立させる。あわせて未消費キーの残留による誤帰属を防ぐ。

## 要件

### 機能要件

- [ ] FR-182-01: `src/views/AuthCallbackPage.tsx` の `sign_up` を push する3箇所（:53-56 メール確認 / :64-67 OAuth SIGNED_IN / :76-79 OAuth INITIAL_SESSION）で、`zaridasu:authFrom` を読み取り、存在すれば `from` を `sign_up` イベントに付与する。
- [ ] FR-182-02: `sign_up` への `from` 付与は、Google OAuth経路（同一タブでリダイレクト往復するため `sessionStorage` が保持される）を確実に捕捉することを必須とする。
- [ ] FR-182-03: `from` を消費した後は `zaridasu:authFrom` を削除する（CV確定が最終消費点）。`login` イベント側でも、残留防止のため読み取り時に削除してよい（ただし `login` には `from` を付与しない/する方針を実装時に決定し、本REQに記録する）。
- [ ] FR-182-04: メール経路の取り扱いを整理する。`AuthModal.tsx:166-178` の `sign_up_initiated` で `authFrom` を即削除している現状は、同一タブで完結する場合にCV（`sign_up`）まで `from` を残せない。`sign_up_initiated` では削除せず読み取りのみとし、最終CV（`sign_up`）で削除する、または TTL 方式に変更する（実装時に方式を確定）。同一タブで完結するメール確認（稀）でも `from` が `sign_up` に届くようにする。
- [ ] FR-182-05: 別タブ/別端末で開かれるメール確認リンク経由の `sign_up` は `sessionStorage` を共有しないため `from` 復元不能である、という制約を本REQおよびコードコメントに明記する（仕様上の限界として許容）。
- [ ] FR-182-06: 残留対策として、`zaridasu:authFrom` に書き込み時刻（タイムスタンプ）を併記し、読み取り時に一定TTL（例: 30分）を超えていれば破棄して `from` を付与しない。または「CV/login のいずれかで必ず削除」を保証することで残留窓を最小化する（いずれかを実装時に採用）。

### 非機能要件

- [ ] NFR-182-01: `sessionStorage` アクセスは try/catch で保護し、利用不可環境（プライベートモード等）でも例外で登録フローを止めない（既存 `HomeInteractive.tsx:157-159` / `AuthModal.tsx:169-172` の方針を踏襲）。
- [ ] NFR-182-02: `from` の値はイベントパラメータとして dataLayer に渡すのみで、DOM への描画・HTMLへの埋め込みは行わない（XSS入力面を作らない。REQ-176 NFR-176-05 準拠）。

## 受入条件

- [ ] AC-01（Google・ユニット/結合）: `sessionStorage['zaridasu:authFrom']='lp'` がセットされた状態で `AuthCallbackPage` のOAuth新規登録分岐（`SIGNED_IN` / `INITIAL_SESSION` かつ `created_at` が60秒以内）を発火させると、`window.dataLayer` に `{ event: 'sign_up', method: 'google', from: 'lp' }` が push される。
- [ ] AC-02（メール・ユニット/結合）: 同様に `authFrom='lp'` の状態でメール確認分岐（`SIGNED_IN` かつ `type=signup|email`）を発火させると、`{ event: 'sign_up', method: 'email', from: 'lp' }` が push される。
- [ ] AC-03（from無し）: `zaridasu:authFrom` が未設定のとき、`sign_up` イベントに `from` キーが含まれない（直接登録・自然流入が誤って `from=lp` にならない）。
- [ ] AC-04（消費後削除）: `sign_up` 発火後、`sessionStorage.getItem('zaridasu:authFrom')` が `null` になる（残留しない）。
- [ ] AC-05（残留TTLまたは確実消費）: 採用方式に応じて — (TTL案) 書き込みから30分超で読み取った場合 `from` が付与されない／(確実消費案) `login` イベント発火時にも `authFrom` が削除され残留窓が登録/ログイン1回で閉じる、のいずれかをテストで確認する。
- [ ] AC-06（E2E）: Playwright で `/lp` → 主CTA（`/?auth=signup&from=lp`）→ ルートで AuthModal が signup タブで開く → （Google はモック/スタブ）コールバック到達 → `dataLayer` に `from: 'lp'` 付き `sign_up` が積まれることを検証する。別タブで開くメール確認は対象外（FR-182-05 の制約）と明記する。

## 実装メモ（採用方式の確定）

- **退避フォーマット**: `zaridasu:authFrom` は `JSON.stringify({ v: from, t: Date.now() })` で保存する（旧: 生文字列）。読み取り側は JSON.parse し `v`/`t` を検証する。`HomeInteractive.tsx` が唯一の書き込み点。
- **FR-182-04（メール経路）**: TTL 方式を採用。`AuthModal` の `sign_up_initiated` では **読み取りのみ・削除しない**（`readAuthFrom`）。最終 CV（`AuthCallbackPage` の `sign_up`）で `consumeAuthFrom` が読み取り＋削除する。これにより同一タブで完結するメール確認でも `from` が CV まで届く。
- **FR-182-06（残留対策）**: TTL=30分。`readAuthFrom`/`consumeAuthFrom` とも、`t` が現在時刻から30分超なら破棄し `from` を付与しない。加えて `consumeAuthFrom` は `from` の有無に関わらず常にキーを削除する（CV/login での確実消費）。両方式を併用し残留窓を最小化。
- **FR-182-03（login の方針）**: `login` イベントには `from` を **付与しない**（CV ではないため）。ただし OAuth ログイン経路（`AuthCallbackPage` の `login`）でも `consumeAuthFrom` を呼び、残留キーを削除する（登録/ログイン1回で残留窓が閉じる）。
- **ヘルパの配置**: 許可編集ファイルが3つに限定されるため共通 util は作らず、`AuthModal.tsx` に `readAuthFrom`（読み取り専用）、`AuthCallbackPage.tsx` に `consumeAuthFrom`（読み取り＋削除）をモジュール内関数として配置（同一フォーマット・TTL で整合）。
- **GA4 整合（REQ-232）**: 送出は既存 `trackEvent('sign_up', { method, from })` に統一。イベント名・`method` は不変、`from` のみ条件付き追加。

## 影響範囲

- `src/views/AuthCallbackPage.tsx`（`sign_up` push 3箇所への `from` 付与・削除）
- `src/components/modals/AuthModal.tsx`（`sign_up_initiated` の即削除をやめる/TTL化。FR-182-04）
- `src/app/(home)/HomeInteractive.tsx:147-165`（TTL方式採用時は書き込みにタイムスタンプ付与）
- GA4/GTM 設定（`sign_up` の `from` パラメータをカスタムディメンションで受ける側の設定。本REQはアプリ側の送出までを範囲とする）
- DB・RLS・API変更なし。

## 優先度

- **緊急度**: High / **重要度**: High
- **理由**: REQ-176 の最重要KPI（主CV = LP経由登録）の計測がそもそも成立しておらず、特に推奨経路のGoogle登録が完全に計測不能。LP・広告施策の効果検証（および卒研 H2 のユーザー獲得測定）が数値で語れない状態は、施策運用の前提を欠く。修正はクライアント側のイベント付与のみでDB変更なし、リスクは限定的。
