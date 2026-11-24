> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# UI改善要件定義 — バイオーム参考リデザイン

## これは何か

生きもの記録アプリ「バイオーム」を参考に、ザリダスのナビゲーション構造と画面レイアウトを刷新するための
UI 改善要件定義書。改善項目 1〜6、画面遷移図、実装優先度、新規／削除コンポーネント、
デザイントークン変更までを定義している。
本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 背景の要約

モバイルのナビゲーションがハンバーガー依存で主要機能に毎回ドロワーが必要、ヘッダーが情報過多、
ホーム画面が地図／リストの 2 択のみで初見ユーザーに何をすればよいか伝わらない、
PostCard がテキスト中心で写真が目立たない、マイページが深い階層にありゲーミフィケーションが見えない、
という 5 点が課題。

## 主要な決定事項の要点

- **維持するもの**：色味（赤ベース）とダークモード対応はそのまま。変えるのは形・レイアウト・ナビゲーション構造。
- **モバイルファーストで設計**し、デスクトップは既存のデュアルパネルを活かす。
- **ボトムタブ 5 つを常時表示**：`[🗺️ 地図][📊 統計][＋ 投稿][🏆 ランキング][👤 マイページ]`。
  これに伴い地図上の FAB は削除しタブへ統合、DrawerMenu のナビ項目もタブへ移し、ドロワーは設定のみにする。
- **実装優先度**：高＝ボトムタブ追加・ヘッダー簡素化。中＝ホームのミニプロフィール、PostCard のカード型化、
  フィルタバー簡素化、地図/リストのセグメント切替。低＝マイページ整理。
- **新規コンポーネントは 2 つ**：`BottomNav`（`src/components/layout/BottomNav.jsx`）、
  `MiniProfile`（`src/components/features/home/MiniProfile.jsx`）。
- **トークン変更**：ヘッダー h-14 → h-12、ボトムタブは新規 h-16＋safe-area、カード角丸 rounded-2xl → rounded-xl、
  投稿カード写真は w-14 h-14 → w-full aspect-[4/3]（グリッド表示時）。Header の赤グラデーションはフラットな白/ダークへ。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-issues-and-design-direction.md](requirements-ui-redesign/01-issues-and-design-direction.md) | 現状の課題サマリー 5 点と改善方針（維持するもの・変えるもの） |
| [02-item-1-2-bottom-nav-and-header.md](requirements-ui-redesign/02-item-1-2-bottom-nav-and-header.md) | 改善項目一覧の冒頭、1. ボトムタブナビゲーションの追加（高）、2. ヘッダーの簡素化（高） |
| [03-item-3-4-home-and-postcard.md](requirements-ui-redesign/03-item-3-4-home-and-postcard.md) | 3. ホーム画面の再構成（中）、4. 投稿カード（PostCard）のビジュアル強化（中） |
| [04-item-5-6-filterbar-and-dashboard.md](requirements-ui-redesign/04-item-5-6-filterbar-and-dashboard.md) | 5. フィルターバーの簡素化（中）、6. マイページ（Dashboard）のバイオーム風整理（低） |
| [05-screen-flow-priority-and-tokens.md](requirements-ui-redesign/05-screen-flow-priority-and-tokens.md) | 画面遷移図、実装優先度、新規コンポーネント、削除・縮小対象、デザイントークン変更 |
