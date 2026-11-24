# REQ-150 判断記録: 状態変更操作の CSRF トークン検証

本ドキュメントは REQ-150（状態変更操作の CSRF トークン検証）に対する調査結果と実装方針の判断記録である。
REQ-116（CSP unsafe-inline 判断記録）と同様、「実装しない／延期する」判断とその根拠を残すための文書である。

## 結論（要約）

ザリダスの管理操作（承認/却下/削除/権限変更/通報解決/公式切替）は **Supabase JS クライアントが
`Authorization: Bearer <JWT>` ヘッダで認証** しており、Cookie のアンビエント送信だけでは認証が成立しない。
したがって **古典的 CSRF（Cookie 自動送信のみで攻撃が成立する形態）は本アプリの Supabase データ API に対して
成立しない**。この前提のもとでは、クライアント直叩きの Supabase 呼び出しに CSRF トークンを追加しても
追加の防御効果は得られないため、**CSRF トークンの導入は見送る（延期する）**。

一次防御（Bearer トークン認証）＋ Cookie の `SameSite=Lax`/`Secure`（REQ-019E）＋ RLS（admin ロール検証）の
多層防御は維持する。

## 調査結果（FR-150-03: 認証情報格納方式の確認）

- セッションは `@supabase/ssr` により Cookie に保存される（SSR セッション、`src/lib/supabase/middleware.ts:25-29`）。
- 一方、ブラウザの Supabase JS クライアント（`createBrowserClient`）は、データ API（PostgREST）/ Auth API への
  各リクエストに **`apikey` ヘッダと `Authorization: Bearer <access_token>` ヘッダ** を付与する。PostgREST は
  この Bearer JWT で認証・認可（RLS の `auth.uid()` / `app_metadata.role`）を行い、**Cookie では認証しない**。
- クロスサイトの攻撃ページは:
  - 被害者の Cookie を自動送信させられても、Supabase データ API は Cookie を認証に使わないため認可されない。
  - 被害者の JWT（access_token）を読み取れない（Same-Origin Policy）。
  - `Authorization` ヘッダはカスタムヘッダであり、クロスオリジンでは CORS プリフライトの対象。攻撃者は有効な
    JWT を保持しないため、そもそも正当な Authorization ヘッダを構成できない。
- よって「Cookie の自動送信だけで状態変更が成立する」古典的 CSRF は成立しない。

## CSRF トークンを追加しない理由

1. **攻撃面が存在しない**: 認証は Bearer トークンで行われ、CSRF 攻撃者はトークンを取得・送信できない。
   トークンを追加しても防ぐべき攻撃が存在しない。
2. **防御効果が無い**: CSRF トークンは JWT と同じくブラウザの同一オリジン JS から到達可能な場所に置かれる。
   - CSRF 攻撃者: JWT もトークンも持てない → トークン有無に関わらず失敗する。
   - XSS 攻撃者: JWT もトークンも読める → トークンがあっても突破される。
   いずれのケースでもトークンは結果を変えない（defense theater）。
3. **コスト/リスクが見合わない**: トークンを実効化するには全管理操作を Server Action / Route Handler 経由へ
   移し、クライアント直叩きの Supabase 書き込みを廃する大規模リファクタが必要になる。Bearer 認証下では
   セキュリティ向上が無いため、その複雑性・回帰リスクに見合わない。

## 維持する多層防御（実装済み）

| 層 | 内容 | 箇所 |
|---|---|---|
| 認証 | Bearer JWT による PostgREST 認証（Cookie 非依存） | Supabase JS クライアント |
| Cookie | `SameSite=Lax` + 本番 `Secure`（REQ-019E） | `src/lib/supabase/middleware.ts:24-29` |
| 認可 | RLS による admin ロール検証（最終防御） | `supabase/schema.sql` の各 RLS ポリシー |
| ルートガード | middleware で `/admin` を `getUser()` 検証 | `src/lib/supabase/middleware.ts:41-52` |

AC-150-05（`SameSite=Lax` と本番 `Secure` の維持）は満たされている。

## 再評価のトリガー（この判断を見直す条件）

以下のいずれかが発生した場合、CSRF トークン（double-submit cookie / 同期トークン）の導入を再評価する:

- 管理操作を **Cookie 認証の Server Action / Route Handler** に移行した場合
  （= アンビエント Cookie が認証に使われる構成になり、古典的 CSRF の攻撃面が発生するため）。
- Supabase のセッション送出方式が Cookie 認証ベースに変わった場合。
- 一般ユーザーの状態変更（コメント投稿・通報送信）を含め、Cookie 認証経路を新設する場合。

## 関連

- REQ-019E: SameSite Cookie 強制（一次防御）。本判断はその上での CSRF トークン要否の検討。
- REQ-116: CSP unsafe-inline 判断記録（同様の「延期・判断記録」パターン）。
