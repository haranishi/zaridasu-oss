# REQ-268: スマホ（モバイル）レスポンシブ対応の総仕上げ

## これは何か

2026-07-12 時点の main に対する4方面のコード監査（基盤+ホーム / 新規ページ群 / フォーム・モーダル /
旧要件残+横断グリープ）に基づく、モバイル体験の総点検と是正要件。旧 `responsive-mobile.md` の
後継で、未解決分も本書に統合している。詳細は `REQ-268-mobile-responsive-hardening/` 配下に分割。

## 目的・背景（要約）

「野外で発見してスマホから投稿する」が主利用シーンのため、モバイル体験が最重要。REQ-176〜266 で
LP・3D水槽・調査依頼・種別/地域ハブ・データセット・ランキング/トレンド・クエスト UI・水域レイヤーなど
多数の画面が追加されたが、これらは旧監査の対象外だった。目的は (1) 「操作できない/読めない/隠れる/
はみ出す」の全廃、(2) iOS 固有問題（safe-area 無効・100vh・自動ズーム・ラバーバンド）を仕組みで塞ぐ、
(3) 旧要件の未解決項目を清算して本書を単一のレスポンシブ基準にすること。

## 主要な決定事項（要点）

- **A: `viewport-fit=cover` 未設定**のため `env(safe-area-inset-*)` が iOS で 0 に評価され得る。
  シェルの `h-screen`（100vh）は dvh 化する。**ピンチズーム禁止は導入しない**（WCAG 1.4.4）。
- **B: モーダルの z-index は BottomNav（`z-[420]`）超の `z-[430]` に統一**し、規約として明文化して再発を防ぐ。
  InstallBanner は z 変更ではなく bottom オフセットで回避する。
- **C/D: モーダルは `max-h-[90dvh] overflow-y-auto` + safe-area、入力は `text-base md:text-sm`（16px）に統一**。
- **E: タッチターゲットは 44×44px 以上**。最優先はコメント削除 18px / EditDialog 写真削除 16px / bounds 解除× 22px。
- **G: 横はみ出しは個別修正 + body の `overflow-x` セーフティネット**の二段構え。
- 変更は UI 層に閉じ、データフロー・API・DB・i18n キーは変更しない。新規依存の追加も禁止。
- **実装は P1 → P2 完了済み（commit d68d59a / bf464cc）、P3 は一部実装で follow-up あり**。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-268-mobile-responsive-hardening/01-background.md) | 背景（旧 responsive-mobile.md との関係と、本書が依拠する監査の範囲） |
| [02-problems-foundation-and-modals.md](REQ-268-mobile-responsive-hardening/02-problems-foundation-and-modals.md) | 問題 A〜D: viewport-fit / h-screen、z-index 衝突、モーダルが画面に収まらない、iOS 自動ズーム |
| [03-problems-touch-targets-and-fonts.md](REQ-268-mobile-responsive-hardening/03-problems-touch-targets-and-fonts.md) | 問題 E〜F: タッチターゲット 44px 未満の一覧表（実測目安と証拠）、極小フォント（9px / 10px） |
| [04-problems-overflow-and-ux.md](REQ-268-mobile-responsive-hardening/04-problems-overflow-and-ux.md) | 問題 G〜H: 横はみ出し・BottomNav との重なり、その他のモバイル UX、良好で変更不要な点 |
| [05-goals-and-p1-requirements.md](REQ-268-mobile-responsive-hardening/05-goals-and-p1-requirements.md) | 目的 3 点と P1 機能要件 FR-268-01〜05（機能が壊れている/操作不能な項目） |
| [06-p2-p3-and-nfr.md](REQ-268-mobile-responsive-hardening/06-p2-p3-and-nfr.md) | P2 機能要件 FR-268-06〜11、P3 FR-268-12〜13、非機能要件 NFR-268-01〜04 |
| [07-acceptance.md](REQ-268-mobile-responsive-hardening/07-acceptance.md) | 受入条件 AC-01〜12（375px 横スクロール無し・PWA safe-area・自動ズーム無し等） |
| [08-impact-and-priority.md](REQ-268-mobile-responsive-hardening/08-impact-and-priority.md) | 影響範囲（領域別の変更対象ファイル）・他機能への影響・優先度と段階実装の順序 |
| [09-implementation-status.md](REQ-268-mobile-responsive-hardening/09-implementation-status.md) | 実装状況（2026-07-12）: P1/P2 完了内容と P3 の実装済み・follow-up 残 |
