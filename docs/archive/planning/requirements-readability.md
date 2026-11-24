> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: UI-002 精読性（リーダビリティ）改善

- **ID**: UI-002
- **優先度**: 🔴 高（全ユーザーの日常利用に直結）
- **対象範囲**: アプリ全体（公開ページ + 管理画面）
- **作成日**: 2026-03-20
- **基準**: WCAG 2.1 AA 準拠

---

## これは何か

アプリ全体の文字サイズ・コントラスト・省略表示を見直し、精読性を上げるための要件定義書（UI-002）。長いため機能要件 F1〜F8 の境界で分割し、本文は `requirements-readability/` 配下へ逐語で移した。

## 目的・背景の要約

`text-xs`（12px）がアプリ全域で多用され、`text-gray-400`（コントラスト比 2.8:1）が日付・市区町村・コメントに常用されていた。加えて PostCard や地図ポップアップのテキストが `truncate` / `line-clamp` で切れて全文確認手段がなく、ダークモードでは `text-slate-400/500/600` が背景に溶け、BarChart のラベルは 10px で数値が読めない状態だった。これらを WCAG 2.1 AA 水準へ引き上げるのが目的。

## 主要な決定事項（要点）

- **最小フォントサイズは本文 14px（`text-sm`）**。`text-xs`（12px）を使ってよいのは補助ラベル・バッジ内テキスト・著作権表記のみ。モバイル（375px 幅）でもこれ以上小さくしない。
- **コントラストは通常テキスト 4.5:1 以上、大テキスト（18px 太字 or 24px）3:1 以上**。ダークモードでもライトモードと同等の比を確保する。
- チャートラベルは 12px 以上、地図ポップアップのコメントは 3 行表示とする。
- 改善順は **P1: PostCard / MapView ポップアップ / StatsBar** → **P2: FilterBar / TrendsPage チャート / CommentSection** → **P3: Footer・Header 細部 / PostForm・EditDialog ラベル**。
- 検証は Chrome DevTools の Rendering > Emulate vision deficiencies で色覚異常時にも情報が伝わることまで確認する。

## 分割ファイル

- [01-issues-stories-and-f1-f2.md](requirements-readability/01-issues-stories-and-f1-f2.md) — 現状の課題サマリー、ユーザーストーリー US1〜US5、F1 フォントサイズ底上げ、F2 コントラスト比改善
- [02-f3-f8-detail-improvements.md](requirements-readability/02-f3-f8-detail-improvements.md) — F3 テキスト省略／F4 地図ポップアップ／F5 StatsBar／F6 PostCard／F7 チャートラベル／F8 フォームラベル
- [03-nonfunctional-and-implementation-design.md](requirements-readability/03-nonfunctional-and-implementation-design.md) — 非機能要件（WCAG 基準・最小サイズ・ダークモード・視認性テスト）と変更ファイル一覧
- [04-content-priority-proposals-and-tests.md](requirements-readability/04-content-priority-proposals-and-tests.md) — コンテンツ優先度（P1〜P3）、改善提案一覧、テスト観点
- [05-before-after-by-screen.md](requirements-readability/05-before-after-by-screen.md) — 画面別ビフォーアフター（PostCard / StatsBar）
