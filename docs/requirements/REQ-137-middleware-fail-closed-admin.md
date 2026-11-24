# REQ-137: middleware fail-open による /admin/* 認証バイパス（fail-closed 化）

## これは何か

`updateSession()` の catch が全例外を握りつぶして素通りさせるため、**Supabase 障害時に `/admin/*` の
認可ガードがスキップされる**問題の修正要件。緊急度・重要度ともに **Critical**。

## 目的・背景（要約）

middleware は Supabase クライアント生成から `auth.getUser()` までを
`try { ... } catch { return NextResponse.next({ request }) }` で囲っており、**いかなる例外でも
リクエストを通過させる fail-open** になっている。これは元々「Supabase 障害時に 500 を出さない」ための
フェイルセーフだったが、`/admin/*` のような認証必須ルートまで同じ catch に巻き込まれている。

結果、Auth API の 5xx・タイムアウト・cookie parse 例外・Edge runtime の OOM などが起きると
`if (!user) redirect(...)` / role チェックが実行されず、未認証リクエストが admin ルートに到達する。
しかも catch されたエラーは Sentry にも送られないため、**障害に気付けない**。

## 主要な決定事項（要点）

- **catch の挙動を path 別に切り替える**。`matcher` は変えない。
  - `/admin/*`（`/admin/login` を除く）→ `/admin/login?reason=auth_unavailable` へ redirect
  - `/dashboard/*` → `/?reason=auth_unavailable` へ redirect
  - **公開ルートは fail-open を維持**する（Supabase 障害時に閲覧機能まで止めない）
- catch で **`logError(err, 'middleware:updateSession')`** を呼び、サイレント障害を可視化する。
  秘匿情報のフィルタは `logError` 内部の既存挙動に任せる。
- `reason=auth_unavailable` のときだけログイン画面に inline alert を出す。**クエリ無しの通常導線は無変更**。
- **middleware を唯一の防御線にしない**。admin の最上位 `layout.tsx` で改めて `getUser()` の role 検証を行う
  （defense in depth）。RSC の中には getUser を呼ばずに DB 取得を始めるものが残存しているため。
- REQ-049 の既存テスト（未認証 → redirect、role=user → `/` redirect）は**挙動不変**を保証する。
- 攻撃者が rate limit を意図的に発火させたり DoS で getUser を timeout させれば認可をバイパスしうる。
  実装コストが低くリスクが大きい典型的な Critical 案件。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-problems-goals.md](REQ-137-middleware-fail-closed-admin/01-background-problems-goals.md) | 背景（fail-open の経緯と再現ケース）、現状の問題（該当行）、目的4点 |
| [02-functional-requirements.md](REQ-137-middleware-fail-closed-admin/02-functional-requirements.md) | 機能要件 FR-137-01〜05（fail-closed 化の実装イメージ・Sentry 送信・理由表示・二重防御・公開ルート維持） |
| [03-non-functional-and-tests.md](REQ-137-middleware-fail-closed-admin/03-non-functional-and-tests.md) | 非機能要件 NFR-137-01〜03 とテスト要件 FR-137-06〜08（Vitest ケース A〜E・Playwright・regression） |
| [04-acceptance-impact-priority.md](REQ-137-middleware-fail-closed-admin/04-acceptance-impact-priority.md) | 受入条件 AC-137-01〜08、影響範囲（変更ファイル・他 REQ への影響）、優先度と理由 |
