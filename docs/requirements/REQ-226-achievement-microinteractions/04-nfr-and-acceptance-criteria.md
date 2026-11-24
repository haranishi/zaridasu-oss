### 非機能要件（該当する場合のみ）

- [ ] NFR-226-01: **アニメは軽量・非ブロッキング。** 追加するアニメは `transform`/`opacity` のみを使い、`width`/`height`/`top`/`left`/`margin` 等のレイアウトプロパティはアニメ対象にしない（reflow 回避、`デザイン基礎/マイクロインタラクションとモーション.md` 準拠）。各アニメ duration は 100〜300ms。アニメの完了/失敗に関わらず、いいね・コメントの**データ整合性とアクセシビリティ（フォーカス・読み上げ）は変わらない**こと。

- [ ] NFR-226-02: **`prefers-reduced-motion` 完全遵守。** すべての新規演出（いいね pop・コメント入場・バッジ解放・カウントアップ）は reduced-motion で即時表示にフォールバックし、動きを伴わない（REQ-015／`globals.css:63-70` の土台を壊さない）。JS 駆動の演出（カウントアップ等）は `window.matchMedia('(prefers-reduced-motion: reduce)')`（`AudioRecorder.tsx:108` の前例）を見て分岐する。

- [ ] NFR-226-03: **楽観的 UI の正確性。** 楽観的更新は失敗時に必ず元状態へ戻り、ユーザに失敗が伝わること（無言で消えない）。二重送信防止（いいねの `togglingRef`、コメントの submitting）を壊さない。楽観値とサーバ確定値が乖離したまま残らないこと（確定後に置換 or 再取得で収束）。

- [ ] NFR-226-04: **重複・DRY。** 楽観的 UI の作法（pending→commit→rollback）は、いいね・コメントで一貫した実装にする。`useOptimistic` を使う場合は同じ型で揃える。バッジ「新規判定」のロジックは 1 箇所（フック or util）に集約し、ProfilePage/BadgeSection で再利用する。

- [ ] NFR-226-05: **スコープ境界を守る。** サーバ側スキーマ・RLS・バッジ付与トリガーは変更しない（表示側のみ）。ランキングの設計（REQ-171）・LP のアニメ（REQ-204）・pending 投稿のオンライン反応性（REQ-197）・reduced-motion 基盤（REQ-015）には手を入れない。

## 受入条件

- [ ] AC-01: いいねボタン押下時、ネットワーク応答を待たずにハートと件数が即時に変わる（楽観的更新）。意図的に失敗させると元の状態へロールバックし、`error` トーストが出る（ユニットテスト or 手動確認）。
- [ ] AC-02: いいね成立時、reduced-motion **無効**では `transform: scale` の pop が 1 回再生され、reduced-motion **有効**では pop が再生されず `fill` 切替のみになる。連打しても pop が多重再生・破綻しない。
- [ ] AC-03: コメント送信時、`insert` 完了を待たずに自分のコメントが一覧へ即時表示される。失敗させると当該コメントが取り除かれ入力内容が復元され、`error` トーストが出る。成功後に重複表示が起きない。
- [ ] AC-04: 新規コメント行が ease-out の軽量入場（`opacity`+`translateY`）で現れ、reduced-motion では即時表示になる。
- [ ] AC-05: 新たに獲得したバッジ（例: 初投稿／種同定＝`multi_species`／`posts_10`）が、マイページ/ダッシュボード初表示時に解放アニメ（フェード＋ scale pop）を一度だけ再生し、再訪時には再生されない。reduced-motion では通常表示。
- [ ] AC-06: 観察進捗カウンタが対象画面に表示され、最終値 N が（アニメの有無・ブラウザに関わらず）DOM に確実に出る。reduced-motion／`animation-timeline` 非対応環境でも最終値が読める。
- [ ] AC-07: 追加した i18n キーが ja/en/ko/zh の 4 ファイルすべてに存在する。
- [ ] AC-08: `globals.css` に追加したキーフレームは `transform`/`opacity` のみで構成され、`prefers-reduced-motion: reduce` 下で抑制される。新規アニメに `width`/`top`/`margin` 等の reflow プロパティが含まれない。
- [ ] AC-09: 既存のいいね/コメント機能（投稿・削除・件数・メール未確認時の挙動）が回帰しない（既存テスト `src/hooks/__tests__/useLike.test.ts` ほかが green）。サーバスキーマ/RLS/バッジトリガーに差分が無い。
