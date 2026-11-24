## 受入条件
- [ ] AC-01: `npm run build && npm run analyze` の stats で、初期 bundle に `ja/translation.json` のみが含まれ、`en/zh/ko/translation.json` は別 chunk または HTTP 配信ファイルとして分離されている。
- [ ] AC-02: ホーム `/` を ja デフォルトで開いた時、Network タブで `en/zh/ko` の翻訳ファイル / chunk が取得されない。
- [ ] AC-03: 言語切替 UI で en を選ぶと、その時点で `en/translation.json` または対応 chunk が初めて取得される。
- [ ] AC-04: Accept-Language: en-US でアクセスした時、SSR HTML の `<html lang="en">` が出る（middleware による cookie ハンドオフ）。
- [ ] AC-05: 既存 i18n テスト（`vitest` の i18n 関連スイート）が緑。
- [ ] AC-06: `.size-limit.json` に追加した監視が pass。
- [ ] AC-07: 既存 E2E（home / post / survey-request / admin-guard）が緑。
- [ ] AC-08: 翻訳キーが見つからなかった場合の fallback（fallbackLng: 'ja'）が動作する。

## テスト要件

### ユニット
- [ ] `src/lib/i18n/__tests__/loadLocale.test.ts`（新規）：
  - 与えられた言語 chunk を fetch → addResourceBundle で i18n に登録する関数の単体テスト。
  - 失敗時に fallback ja を使うこと。
  - 同言語を 2 回ロードしても fetch が 1 回だけ走ること（簡易メモ化）。
- [ ] `src/middleware.ts` のテスト（既存 middleware test に追記、または `src/__tests__/middleware-i18n.test.ts` 新規）：
  - Accept-Language: en で `Set-Cookie: zaridasu_lang=en` が付くこと。
  - 既存 cookie が優先されること。
  - サポート外言語は ja にフォールバック。

### E2E
- [ ] `tests/e2e/i18n-lazy.spec.ts`（新規）：
  - `/` 初回アクセスで Network filter `translation` の結果が 1 ファイル / chunk のみ。
  - LanguageSwitcher で en に切替 → `en/translation.json` を取得 → 画面文言が英語化。
  - リロード後も en が persist する（cookie / localStorage）。

### 監視
- [ ] `npm run size` が pass。
