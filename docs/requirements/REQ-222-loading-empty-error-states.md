# REQ-222: Loading(スケルトン)/Empty/Error 3状態の体系整備（Empty state のオンボーディング化）

## これは何か

ザリダスの全データ取得画面に **Loading(スケルトン) / Empty / Error の3状態を統一コンポーネントとして体系化**し、とりわけ **Empty state を「肯定形コピー＋単一の投稿 CTA」のオンボーディングに作り替える**要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

ザリダスの主要画面はほぼすべて Supabase からのデータ取得を伴う。Obsidian デザイン基礎ノートは、こうした画面に3状態を必ず作ること、スケルトンは実コンテンツと同じ骨格にして体感待ち時間短縮と CLS 防止を両立すること、空状態は「説明2:楽しさ1」で肯定形＋単一 CTA にすることを基本としている。

現状は (A) Loading が中央スピナー偏重で、`Skeleton*` 部品があるのに管理画面でしか使われていない、(B) Empty が「まだ〇〇がありません」の否定形・行き止まりで、共通の `EmptyState` コンポーネントが存在しない、(C) 3状態のコピーにハードコード日本語が残り i18n パリティから外れている、(D) Loading の `role="status"`/`aria-busy` が不統一、という4点の問題を抱える。市民科学 PF として**初回貢献への誘導**を重視する以上、新規ユーザーが最初に出会う空状態が最大の機会損失になっている。

## 主要な決定事項の要点

- **分岐順序を `loading → error → empty → 正常` に固定**し、Error と Empty を混同しない（REQ-192 と一致）。
- **`EmptyState` を新設**（`icon` / `title` / `description?` / `action?`）。**CTA は 1 つに限定**し、意思決定を割らない。フィルタ由来の 0 件では「リセット」を唯一の CTA にできる。
- **スピナーを残すのはボタン内・小領域の即時操作だけ**。一覧・ページの Loading は実コンテンツと同じ寸法・グリッドのスケルトンへ寄せる。
- **既に CTA を持つ良い実装も同じ `EmptyState` に統一する**（`MyPostsSection` / `AreaPageClient` / `SurveyRequestsListPage`）。独自マークアップを残さない。
- **境界を明確に切っている**。state 分離と再フェッチ配線は REQ-192、地図の例外バウンダリは REQ-201、`role`/`aria-live` の実装は REQ-195、操作失敗トーストは REQ-193、存在しない ID の真404化は REQ-198 が主管。**本 REQ の Empty は「取得成功かつ 0 件」のみ**を指す。
- **REQ-192 未マージでも先行導入できる後方互換な作り**にする（`EmptyState`・スケルトンを先に入れ、Error 表示は段階的に差し込む）。
- **コピーは ja/en/ko/zh の4ロケール**に揃え、`npm run i18n:check` を通す。新規のハードコード日本語を足さない。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-222-loading-empty-error-states/01-background.md) | 背景（デザイン基礎ノート3本の根拠と市民科学 PF としての位置づけ）と、既存 REQ-192/201/193/195/198 との関係 |
| [02-current-problems.md](REQ-222-loading-empty-error-states/02-current-problems.md) | 現状の問題 A〜D（スケルトン資産の死蔵・否定形 Empty の散在・i18n 混在・Loading の a11y 不統一）をファイルパス:行番号つきで列挙 |
| [03-goals-and-requirements.md](REQ-222-loading-empty-error-states/03-goals-and-requirements.md) | 目的4点と、機能要件 FR-222-01〜08（パターン定義・EmptyState 新設・オンボーディング化・スケルトン化・CLS・a11y・i18n・DRY）、非機能要件 NFR-222-01〜04 |
| [04-acceptance-impact-and-priority.md](REQ-222-loading-empty-error-states/04-acceptance-impact-and-priority.md) | 受入条件 AC-01〜08、影響範囲（担う範囲／担わない範囲＝重複回避／他機能への影響リスク）、優先度と理由 |
