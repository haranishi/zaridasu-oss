# REQ-041: EditDialog の画像プレビュー最適化

## 背景
投稿編集ダイアログ `EditDialog` では、既存写真と新規追加写真のサムネイルを並べて表示する。既存写真には `next/image` の `<Image>` が使われているが、新規追加分のプレビューにはネイティブ `<img>` が直書きされており、レイアウトシフト（CLS）や遅延読込の恩恵を受けていない。

## 現状の問題
- `src/components/modals/EditDialog.tsx:180`

```tsx
<img src={src} alt={`新規${i + 1}`} className="w-full h-full aspect-square object-cover rounded-lg opacity-80 ring-2 ring-red-400" />
```

- `width` / `height` が未指定のため、blob URL 画像ロード前後でサムネイル枠のサイズが確定せず CLS の原因になり得る
- `loading="lazy"` / `decoding="async"` が指定されておらず、ダイアログを開いた瞬間に同期的にデコードされる
- 上部の既存写真（`:168`）は `<Image ... fill>` で最適化されているのに、新規プレビュー（`:180`）だけ扱いが非一貫
- `next/lint` で `@next/next/no-img-element` に抵触する可能性

## 目的
サムネイルプレビューにおける CLS を抑え、読込と描画のコストを下げる。既存コードとの扱いを揃えて保守性も向上させる。

## 要件

### 機能要件
- [ ] FR-041-01: `<img>` を継続利用する場合、`width={64} height={64} loading="lazy" decoding="async"` を明示する
- [ ] FR-041-02: もしくは `next/image` に置換し、`sizes="64px"` を指定した上で親要素を relative + `fill`、または固定 `width/height` でレンダリングする
- [ ] FR-041-03: blob URL（`URL.createObjectURL`）を `next/image` で扱う場合、`unoptimized` を付与して外部最適化を回避する
- [ ] FR-041-04: 既存の削除ボタン等の子要素の配置・スタイルは現行のまま維持する

### 非機能要件
- Lighthouse モバイル総合スコアで image 関連の減点が発生しないこと
- 編集ダイアログ開閉時の CLS が 0.01 未満

## 受入条件
- [ ] AC-01: Lighthouse 監査の "Image elements have explicit width and height" で減点無し
- [ ] AC-02: 新規写真追加時にサムネ枠が画像読込前後で変動しない（目視・DevTools Performance で確認）
- [ ] AC-03: `npm run lint` で `@next/next/no-img-element` 警告が増えない
- [ ] AC-04: 既存 `EditDialog` 関連テストが全て通過する

## 影響範囲
- `src/components/modals/EditDialog.tsx`

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: 動作上の不具合ではないがパフォーマンス/一貫性の観点で改善余地があり、Core Web Vitals 向上に寄与する。
