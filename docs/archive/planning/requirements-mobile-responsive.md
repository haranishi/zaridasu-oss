> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# スマホレスポンシブ改善 要件定義

## 対象デバイス
- iPhone SE (375px)
- iPhone 14/15 (390px)
- iPhone 14/15 Pro Max (430px)
- Android標準 (360-412px)

---

## これは何か

スマホ表示の崩れ・重なりを洗い出し、優先度を付けて改善方針を決めた当時の要件定義。課題が9件あり分量が多いため本ファイルを入口とし、各課題は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

ボトムタブ（BottomNav・高さ56px）を導入した結果、その裏に隠れる要素（登録バナー・地図コントロール・リスト末尾）が生まれた。加えて 375px 幅では2カラムのカードやフィルターバーが窮屈になり、テキストのはみ出しや入力困難が起きていた。実機幅ごとの具体的な症状と、どのファイルをどう直すかを対応付けたのがこの文書。

## 主要な決定事項（要点）

- **原因はBottomNavの高さ56pxを各要素が考慮していないこと**。SignupBanner は `bottom: calc(3.5rem + env(safe-area-inset-bottom))`、地図コントロールは `bottom-20`、リストパネルは `pb-16 md:pb-0` で回避する。
- PostCard のグリッドは 375px以下=1カラム／376px以上=2カラムとし、`tailwind.config.js` にカスタムブレークポイント `xs: '400px'` を追加する。デスクトップのサイドバーは1カラム維持。
- 長い文字列（種類名など）のはみ出しは `truncate` と `min-w-0`、バッジは `max-w-[60%]` / `max-w-[35%]` で抑える。
- BottomNav のラベルは `text-[10px]`（推奨最小12pxを下回る）→ `text-[11px]` + `font-medium` に引き上げる。
- z-index は FilterBarドロワーと BottomNav がどちらも `z-[420]` で競合していたため、ドロワーを `z-[430]`（モーダル相当）にするか BottomNav を `z-[415]` に下げる。
- 優先度は高3件（SignupBanner位置／PostCardグリッド／地図コントロール位置）→ 中4件 → 低2件の順。いずれも実装コストは小。

## 部品

- [01-issues-high-priority.md](requirements-mobile-responsive/01-issues-high-priority.md) — 優先度「高」の課題1〜3（SignupBannerの隠れ、PostCard 2カラムの窮屈さ、地図コントロールの重なり）。
- [02-issues-medium-priority.md](requirements-mobile-responsive/02-issues-medium-priority.md) — 優先度「中」の課題4〜7（PostFormのテキストはみ出し、ホーム画面の下端、BottomNavラベル、FilterBar検索バー幅）。
- [03-issues-low-priority.md](requirements-mobile-responsive/03-issues-low-priority.md) — 優先度「低」の課題8〜9（PostCardバッジのはみ出し、z-index競合）。
- [04-priority-summary.md](requirements-mobile-responsive/04-priority-summary.md) — 実装優先度まとめ表（優先度・影響度・コスト・対象ファイル）。
