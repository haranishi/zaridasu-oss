## 背景

`src/lib/i18n.ts` で 4 言語の翻訳 JSON を静的 import → `i18next.init({ resources: ... })` に渡している：

```ts
// src/lib/i18n.ts:6-9
import ja from '@/locales/ja/translation.json'
import en from '@/locales/en/translation.json'
import zh from '@/locales/zh/translation.json'
import ko from '@/locales/ko/translation.json'
```

ファイルサイズ実測（raw）：
- `ja/translation.json`: 43,231 bytes
- `en/translation.json`: 37,128 bytes
- `zh/translation.json`: 36,504 bytes
- `ko/translation.json`: 41,054 bytes
- **合計: 約 157,917 bytes (raw)** ≈ 約 50-60 KB (gzip 後の概算)

`src/lib/i18n.ts` は `'use client'` でクライアント側 i18next を初期化するため、4 言語ぶんがすべて初期バンドルの common chunk または providers chunk に乗る。日本語デフォルトのユーザーが zh / ko / en を毎ページ読み込みするのは無駄。

REQ-024（i18n completion）と REQ-114（i18n missing key detection）で翻訳整備は進んでいるが、ロード戦略は未対応。

## 現状の問題

### 1. `src/lib/i18n.ts:6-9` で 4 言語静的同梱
- 4 ファイルすべてが client bundle に固定で乗る。
- `init({ resources })` に最初から渡すパターンのため、`changeLanguage` 時の追加 fetch なし＝便利だが代償が大きい。

### 2. 初期言語の SSR からのヒントなし
- `src/lib/i18n.ts:27` で `lng: isServer ? 'ja' : undefined` 固定。
- ブラウザ側は LocalStorage / navigator から検出する形のため、SSR HTML は常に ja 前提。
- 結果として、en/zh/ko ユーザーでも初期 HTML は ja、その後 navigator detect → ja 以外を選択 → 翻訳辞書は既にバンドル内なので即時切替 という流れ。chunk 分割するとここで遅延が発生するため、SSR 側で言語ヒントを送る仕組みが必要。

### 3. `next.config.ts` や `middleware.ts` は Accept-Language を見ていない
- 言語決定がクライアント任せ。

### 4. size-limit / bundle 監視に i18n 翻訳の項目がない
- `.size-limit.json` で監視されているのは framework / app shell / page chunk のみ。i18n リソースの肥大化を検知できない。

## 目的

- 初期バンドルから「ユーザーが現に使う言語以外の翻訳」を除去する。
- 言語切替時は背景で必要言語を fetch して反映、UX を維持する。
- 翻訳 JSON のファイル数 / サイズが今後増えてもバンドル全体に効かない構造にする。
