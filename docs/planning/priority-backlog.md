# Priority Backlog (MoSCoW)

Last updated: 2026-03-11
Scope: Quality and scalability improvements for zaridasu

## What this is

MoSCoW（Must / Should / Could）で優先度を付けた品質・スケーラビリティ改善のバックログ。項目ごとに Goal・Deliverables・Definition of done・Owner・Estimate・Dependencies を定める形式で書かれている。長くなったため詳細は `priority-backlog/` 配下に分割した。

> 注: 記述は React Router 期（`HomePage.jsx` / React Router v7 future flags）のもので、現在の Next.js 15 App Router 構成より前の前提を含む。参照するときは現状との差を確認すること。

## 主要な決定事項（要点）

- **Must は 3 件**: M1 重要フローの回帰テスト拡充、M2 重い統計集計の DB 側移動、M3 地図/一覧の bounds フィルタ挙動の是正。
- **テストの合格基準を数値で固定**: statements >= 80 / branches >= 70、新規テスト 8 本以上・失敗系 3 本以上。
- **統計は「クエリ上限に依存しない」ことを要件に含める**（M2）。P95 レイテンシ 500ms 以下、1 万行フィクスチャで値が一致すること。
- **bounds フィルタ ON のときはサーバー側で地図範囲で取得する**（M3）。カウントバッジと一覧件数は常に一致させる。
- **実行順は M1 → M3 → M2 → S1 → S2**（テスト基盤を先に作ってから挙動を直す順序）。

## Items

- [Must](priority-backlog/01-must.md): M1 regression tests / M2 DB-side stats aggregation / M3 bounds filtering
- [Should](priority-backlog/02-should.md): S1 deployment and docs unification / S2 React Router v7 future flags
- [Could](priority-backlog/03-could.md): C1 map interaction performance monitoring / C2 release-gate QA checklist
- [Suggested execution order](priority-backlog/04-execution-order.md): 着手順の並び
