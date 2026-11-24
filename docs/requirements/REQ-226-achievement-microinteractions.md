# REQ-226: 達成感マイクロインタラクション（楽観的UI／バッジ解放／観察進捗カウンタ）

## これは何か

既存機能はそのままに、いいね・コメント・バッジ・観察進捗の「操作直後の体感」を
軽量なマイクロインタラクションで底上げする要件。楽観的 UI 化／バッジ解放アニメ／
観察進捗カウンタの 3 本立てで、市民科学の継続動機（ゲーミフィケーションの視覚面）を高める。

## 主要な決定事項の要点

- **アニメは `transform` / `opacity` のみ**。`width` / `top` / `margin` 等の reflow を誘発する
  レイアウトプロパティはアニメ対象にしない。duration は 100〜300ms、入場は ease-out。
- **`prefers-reduced-motion` を完全遵守**する。REQ-015 の `globals.css:63-70` グローバル抑制の
  土台に載せ、JS 駆動の演出は `window.matchMedia` で分岐する。
- **楽観的 UI の作法をここで確立する**。React 19 の `useOptimistic` を使うか、
  `CommentSection.handleDelete` に既にある「prev 退避 → setState → 失敗時に巻き戻す」型を踏襲する。
  作法は 1 箇所に集約し、いいね・コメントで一貫させる。
- **失敗は無言で握りつぶさない**。ロールバックしたうえで `error` トーストを出す。
  いいね成功は視覚 pop で足りるためトーストを出さない方針を既定とし、判断根拠を実装コメントに残す。
- **進捗カウンタは「値が本体・演出は装飾」**。アニメの有無やブラウザに関わらず最終値 N が DOM に出る
  静的フォールバックを必須とする。`animation-timeline: scroll()` は Safari 未対応のため採用しないか、
  フォールバック前提。`IntersectionObserver` ＋ JS カウントアップを推奨案とする。
- **集計元は既存指標の再利用に限定**し、新規 RPC を追加しない（egress を増やさない）。
  地域単位の集計が既存に無ければ、本 REQ の範囲をプロフィールの進捗カウンタに限定してよい。
- **サーバ側は一切変更しない**。スキーマ・RLS・バッジ付与トリガー（`check_and_grant_badges()`）は不変で、
  改修は表示側に閉じる。
- **バッジの「新規判定」は localStorage 方式を許容**する（別端末・キャッシュクリアで再生され得るが、
  実害は装飾の再生のみ）。判定方法 (a) `earned_at` 差分 / (b) 既知 ID 集合、いずれかを選び根拠を明記する。
- **品質ゲーミフィケーション（データ品質に連動した称号設計）は REQ-235 に委ねる**。
  本 REQ は「達成の瞬間の視覚フィードバック」に限定する。

## 目次（各部品）

- [01-background-and-design-sources.md](REQ-226-achievement-microinteractions/01-background-and-design-sources.md)
  — 背景：達成感フィードバックが弱いという課題、下敷きにした Obsidian 2 ノート（4 構造・duration・軽量な疑似3D）、3 場面の課題、`useOptimistic` 未使用と reduced-motion 基盤の現状。
- [02-current-problems.md](REQ-226-achievement-microinteractions/02-current-problems.md)
  — 現状の問題 1〜6：いいねが応答待ち、コメント送信も応答待ちで地味、`useOptimistic` の作法未確立、バッジ解放演出なし、進捗カウンタなし、達成感向けキーフレーム未整備（すべてファイルパス:行番号つき）。
- [03-goals-and-functional-requirements.md](REQ-226-achievement-microinteractions/03-goals-and-functional-requirements.md)
  — 目的と機能要件 FR-226-01〜09（いいね楽観化、pop アニメ、コメント楽観化、入場アニメ、トースト統一、バッジ解放アニメと新規判定案、進捗カウンタとフォールバック要件、キーフレーム追加、i18n 4 ロケール）。
- [04-nfr-and-acceptance-criteria.md](REQ-226-achievement-microinteractions/04-nfr-and-acceptance-criteria.md)
  — 非機能要件 NFR-226-01〜05（軽量・非ブロッキング、reduced-motion 遵守、楽観的 UI の正確性、DRY、スコープ境界）と受入条件 AC-01〜09。
- [05-impact-boundaries-and-priority.md](REQ-226-achievement-microinteractions/05-impact-boundaries-and-priority.md)
  — 影響範囲（改修する範囲／担わない範囲＝REQ-171・204・197・015・235 との境界／他機能への影響リスク）と優先度。
