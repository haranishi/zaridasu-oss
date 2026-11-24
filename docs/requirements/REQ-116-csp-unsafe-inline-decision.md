# REQ-116: CSP `'unsafe-inline'` を当面維持する判断記録

> 親 REQ: REQ-092
> 関連 REQ: REQ-006（csp-unsafe-inline）— 要件定義時点では「対応する」だったが、実態は対応不能
> 同類: REQ-094（フォントは触らない判断記録）

## 背景
`next.config.ts:53` の Content-Security-Policy ヘッダー：
```
script-src 'self' 'unsafe-inline' [...] https://www.googletagmanager.com
```

`'unsafe-inline'` を含む。REQ-006 で「セキュリティ強化のため除去せよ」と要件定義されたが、**Next.js の現状制約により除去不能**：
- Next.js 15 は SSR で inline script を生成（`__NEXT_DATA__`, chunk loading bootstrap）
- `'unsafe-inline'` を外すと page hydration が壊れる
- nonce ベースの CSP は Next.js の `headers()` config では未サポート（middleware で動的注入が必要だが、CSP の動的化は CDN キャッシュとの整合性問題が大きい）

## 現状の問題（実は対応不能）
- `next.config.ts:46-53` のコメントで状況が記録済み：
  ```
  NOTE: 'unsafe-inline' is required in production because Next.js injects
  inline scripts for bootstrapping (e.g. __NEXT_DATA__, chunk loading).
  Removing it breaks page hydration. XSS risk is mitigated through:
    1) Server-side input sanitization on all user content
    2) React's built-in JSX escaping
    3) Proper JSON-LD escaping in structured data output
  ```
- 既存の XSS 緩和策は実装済（REQ-005 jsonld-xss / 入力サニタイゼーション / React JSX エスケープ）
- 残存リスクは限定的

## 目的
**「現状の Next.js 制約では `'unsafe-inline'` 除去は対応不能」** という判断を文書化し、将来「unsafe-inline をなくせ」という提案が再度出ても根拠を持って判断できるようにする。

## 要件

### 機能要件
- [ ] FR-116-01: 現状の `next.config.ts` の CSP 設定を維持する（変更しない）
- [ ] FR-116-02: `next.config.ts` 内の既存コメントを本 REQ-116 への参照に更新
- [ ] FR-116-03: REQ-006 のステータスを「無期限保留 / REQ-116 で判断記録済」と更新
- [ ] FR-116-04: 本 REQ を「対応条件」付きの判断記録として残す

### 非機能要件
- [ ] NFR-116-01: 設定変更なし、既存挙動に影響なし
- [ ] NFR-116-02: XSS 緩和策（既存 3 つ）が引き続き有効であること

## 受入条件
- [ ] AC-01: 本書（REQ-116）が `docs/requirements/` に保存されている
- [ ] AC-02: `next.config.ts` のコメントから本 REQ-116 への参照リンクが追加されている
- [ ] AC-03: REQ-006 の本文末尾に「REQ-116 で判断記録済」が追記されている

## 例外（`'unsafe-inline'` 除去を再検討する条件）
以下が **同時に満たされた場合のみ** 再検討する：

1. Next.js 15.x または将来バージョンで nonce ベース CSP が `headers()` config で公式サポートされる
2. または、Next.js が SSR inline script を完全に外部化する（chunk strategy の変更）
3. CSP nonce 動的化と Vercel Edge Cache の整合性問題が解決する公式パターンが提示される
4. セキュリティ要件として `'unsafe-inline'` 除去が **法令 / 取引先要件として必須** になる

## 影響範囲
- `docs/requirements/REQ-116-csp-unsafe-inline-decision.md`（本書）
- `next.config.ts` のコメント更新のみ
- `docs/requirements/REQ-006-csp-unsafe-inline.md`（ステータス更新）

## 優先度
- **緊急度**: Low
- **重要度**: Low
- **理由**: 「やらないことを決める」記録。実装作業ほぼゼロ。判断の再現性を保つ。

## 実装メモ
- Next.js 公式が nonce 対応を出した時に再評価
- もし将来「Lighthouse の `csp-xss` を pass させたい」要望が来た場合は、
  - `csp-xss` チェックを Lighthouse CI で OFF にする現状維持
  - または Vercel Edge Middleware で nonce 注入する PoC を立てる（別 REQ）
- 現時点で許容しているリスクの大きさ：低〜中（XSS 多層防御で緩和済）
