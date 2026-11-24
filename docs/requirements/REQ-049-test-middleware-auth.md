# REQ-049: ミドルウェア認可（updateSession）の自動テスト追加

## これは何か

`/admin/*` と `/dashboard` の認可を担う `updateSession` に対して、**認可バイパスの逆行を検知する
integration テスト 6 件**を追加する要件。緊急度 高 / 重要度 **Critical**。

## 目的・背景（要約）

`src/lib/supabase/middleware.ts` の `updateSession` は毎リクエスト呼ばれ、`/admin/*` と `/dashboard` の
**認可判定を担う唯一のチョークポイント**。REQ-035 で `/dashboard` も `getSession` から `getUser` に
変更され、クッキー改ざん耐性が強化された。

しかしこの関数を検証するテストが 1 件も存在せず（`src/lib/supabase/__tests__/` ディレクトリ自体が無い）、
E2E も未導入のため、**`getUser` → `getSession` への逆行や try/catch 範囲の縮小で生じる認可バイパスを
検知できない**。ここがバイパスされると管理画面の全操作が漏洩する。

## 主要な決定事項（要点）

- **守るべき不変条件を INV-01〜06 として明文化**し、テストケース TC-01〜06 と 1 対 1 で対応させる。
- 種別は **integration**（Supabase client のみモックし、`NextRequest` / `NextResponse` は実物を使う）。
- Vitest の既定は jsdom だが、当該ファイルのみ **`// @vitest-environment node`** でオーバーライドする。
- **例外時に 500 ではなく `next()` を返す（fail-open）挙動を INV-06 として保護する**
  ※この fail-open 自体は後に REQ-137 で fail-closed へ変更される論点である。
- 受入条件に**ネガティブ検証**を含める。`getUser` を `getSession` に戻すと TC-05 が RED、
  `try/catch` を削除すると TC-06 が RED になることまで確認して初めて合格とする。
- CI では 3 回連続グリーン（flaky でない）を要求する。
- **プロダクションコードは一切変更しない**（新規テストファイル 1 本のみ・ワークフロー変更も不要）。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-invariants-and-setup.md](REQ-049-test-middleware-auth/01-invariants-and-setup.md) | 背景、守りたい不変条件 INV-01〜06、現状の検出可否、テスト種別・フレームワーク・セットアップ・配置先 |
| [02-test-cases.md](REQ-049-test-middleware-auth/02-test-cases.md) | テストケース TC-01〜06 の Given/When/Then（未認証・非 admin・admin・/admin/login 除外・/dashboard 回帰・throw 時） |
| [03-coverage-fixtures-acceptance.md](REQ-049-test-middleware-auth/03-coverage-fixtures-acceptance.md) | カバレッジ目標、テストデータ／フィクスチャ、受入条件 AC-01〜03、影響範囲、優先度と理由 |
