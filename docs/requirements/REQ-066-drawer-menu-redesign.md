# REQ-066: ドロワーメニュー再設計（Biome 風）

## 背景
Biome アプリのドロワーは、ユーザーのアイデンティティ（アバター・名前・レベル・投稿数）を最上部で大きく可視化し、主要ナビゲーション → 補助リンク → フッターという明確な 3 層構造を持つ。視覚的リズムが整っており、自分のステータスを確認しに来るだけでも利用価値があるデザインになっている。

本アプリの `src/components/layout/DrawerMenu.tsx` はユーザーエリアが 32px のアバター + メールアドレスのみ（`:72-78`）と情報量が乏しく、その下のナビも「マイページ・管理画面・ログアウト」と「使い方（about）」の 2 つしか表示されない。情報ヒエラルキーがほぼフラットで、Biome 風の没入感に欠ける。

## ユーザーストーリー
As a ログイン済みのモバイルユーザー,
I want to ドロワーを開いた瞬間に自分のアバター・ニックネーム・投稿数・レベルが一覧できる,
So that 自分の活動への継続モチベーションが湧き、関連ナビへ迷わずアクセスできる。

## 現状の問題
- `src/components/layout/DrawerMenu.tsx:72-78` — アバター 32px（`w-8 h-8`）は小さく、ユーザー名の代わりにメールアドレスだけが表示される。ニックネーム・投稿数・レベルが皆無。
- `src/components/layout/DrawerMenu.tsx:82-100` — 管理画面とログアウトだけが同じカードに詰まっており、権限別の重要度差が表現されていない。
- `src/components/layout/DrawerMenu.tsx:125-136` — その他リンクに「使い方（about）」しか含まれておらず、Biome では「通知設定 / ヘルプ / お問い合わせ / 利用規約 / プライバシー」等が階層化されている。本アプリでは `/terms`・`/privacy`・問い合わせがフッター（`:171-197`）の極小テキストリンクに追いやられていて視線誘導が弱い。
- `src/components/layout/DrawerMenu.tsx:140-198` — フッター部にバージョン表記がなく、アプリビルドの識別が困難（サポート時の問題再現に不利）。
- `src/components/layout/DrawerMenu.tsx:46` — ドロワー幅 `w-4/5 max-w-xs`（最大 320px）。Biome 参考は 84〜88% 程度で、少し狭い。

## 要件
### 機能要件
- [ ] FR-066-01: ドロワー最上部に「プロフィールカード」を配置。
  - アバター 48×48 px（`w-12 h-12`、ring 2px、イニシャル or 将来のアップロード画像）
  - 表示名（`profiles.display_name` があれば優先、無ければメール先頭）16px / `font-bold`
  - 下段に「レベル L{n}」「投稿 {count} 件」の 2 要素を 13px / 薄色で並記
  - カード全体がタップ可能（`/dashboard` へ）
- [ ] FR-066-02: プロフィールカード下に主要ナビ（5〜6 項目）をリスト形式で表示。
  - 項目例: マイページ / 投稿一覧 / お気に入り / 調査依頼 / 設定 / 管理画面（isAdmin 時のみ）
  - 各行: 左 24px アイコン（lucide-react）＋ 16px テキスト、行高 56px、`hover:bg-gray-50` / `dark:hover:bg-slate-800`
- [ ] FR-066-03: 主要ナビの下に区切り線（1px、`border-t`）を置き、その下に補助リンク群（使い方・利用規約・プライバシー・お問い合わせ）を同じ行デザインで表示。区切り線で重要度差を明示。
- [ ] FR-066-04: 未ログイン時はプロフィールカードの代わりに「ログイン / 新規登録」CTA カードを表示（既存 `:102-121` と同様だが、アバター枠に `UserPlus` アイコンを置き縦並びに再構成）。
- [ ] FR-066-05: フッターに言語切替（既存）、テーマ切替（既存）、および最下部に「v{package.json.version} — build {GIT_SHA 先頭 7 桁}」の極小テキスト（11px / `text-gray-400`）を追加。
- [ ] FR-066-06: 既存の `useEscapeKey` / `open` prop 駆動 / オーバーレイ `onClick` は維持する。

### 非機能要件
- [ ] NFR-066-01: 各行のタップターゲット ≥ 44×44 px（行高 56px で担保）。
- [ ] NFR-066-02: ドロワー開閉・内部トランジションは 250ms 以内。`prefers-reduced-motion` 下で `transition-none`。
- [ ] NFR-066-03: dark variant 対応（既存の `dark` prop 経路を踏襲、背景 `bg-slate-900` / `bg-white`）。
- [ ] NFR-066-04: `role="dialog"` + `aria-modal="true"` を維持。フォーカストラップは既存実装に合わせる。
- [ ] NFR-066-05: プロフィール情報取得は既存の `AuthContext` / `profiles` テーブル経由で、新規 N+1 クエリを発生させない（不足があれば REQ-032 の最適化済みフックを再利用）。
- [ ] NFR-066-06: ビルドメタ（バージョン・GIT_SHA）は `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_BUILD_SHA` 等の環境変数経由で静的注入し、ランタイムで `process.env` を直接参照しない。

## デザイン仕様
### レイアウト
| 項目 | サイズ |
| --- | --- |
| ドロワー幅 | `w-[84%] max-w-sm`（〜384px） |
| ドロワーヘッダー高さ | 56px（現行 48px から引き上げ） |
| プロフィールカード padding | `px-5 py-4` |
| アバター直径 | 48px |
| プロフィール表示名 | 16px / `font-bold` |
| プロフィール副情報 | 13px / `font-medium` / 薄色 |
| ナビ行高さ | 56px |
| ナビ左アイコン | 24px |
| ナビラベル | 16px / `font-medium` |
| 区切り線 | `border-t` 1px（`my-2`） |
| 補助リンク行高さ | 48px |
| フッター padding | `px-5 py-4` |
| バージョンテキスト | 11px / 中央寄せ |

### 配色（既存パレット準拠）
- 背景（ライト/ダーク）: `bg-white` / `bg-slate-900`
- プロフィールカード背景: ライト `bg-gradient-to-br from-red-50 to-rose-50`、ダーク `bg-gradient-to-br from-slate-800 to-slate-850`
- アバター ring: ライト `ring-red-200`、ダーク `ring-red-500/40`
- 行 hover: ライト `bg-gray-50`、ダーク `bg-slate-800`
- 区切り線: ライト `border-gray-100`、ダーク `border-slate-700/60`
- アイコン色: ライト `text-gray-400`、ダーク `text-slate-400`
- 管理画面アイコン（isAdmin）: `text-amber-500`
- ログアウト: `text-red-500`
- バージョン文字: `text-gray-400` / `text-slate-500`

### 状態
- default: 上記色で静的表示。
- active（現在のパスと一致する行）: 左に 3px の赤アクセントバー、ラベル `font-semibold text-red-500`。
- hover/press: `bg-gray-50` → `bg-gray-100` / `bg-slate-800` → `bg-slate-700`。
- disabled（未ログイン時のマイページなど）: 不透明度 50%、`cursor-not-allowed`、タップで AuthModal を開く既存挙動を踏襲。
- focus-visible: `ring-2 ring-red-400 ring-offset-2 ring-offset-white`（ダークは `ring-offset-slate-900`）。

## 受入条件
- [ ] AC-066-01: ログイン済みでドロワーを開くと、最上部にアバター 48px・表示名・レベル・投稿数が視認できる。
- [ ] AC-066-02: 未ログインでドロワーを開くと、プロフィールカード枠に「ログイン / 新規登録」CTA が表示される。
- [ ] AC-066-03: 管理画面リンクは `isAdmin === true` のユーザーでのみ主要ナビに表示される。
- [ ] AC-066-04: 主要ナビ行・補助ナビ行いずれもタップで遷移し、ドロワーが閉じる。
- [ ] AC-066-05: フッターにバージョン（例 `v0.12.3 — abc1234`）が表示される。環境変数未設定時は `v dev` 表示。
- [ ] AC-066-06: ダーク/ライト切替がドロワー内のすべての要素に反映される（コントラスト WCAG AA 以上）。
- [ ] AC-066-07: Axe で WCAG 2.1 AA 違反 0 件。
- [ ] AC-066-08: キーボードのみで Tab 巡回ができ、ESC で閉じる（現行挙動の維持）。

## 影響範囲
- 変更: `src/components/layout/DrawerMenu.tsx`（ほぼ全面再構成）
- 追加: `src/components/layout/ProfileCard.tsx`（再利用可能なプロフィールカード）
- 参照: `src/context/AuthContext.tsx`（`user`、`profile`、`postCount` 等の露出が必要なら追加検討）
- 参照: `package.json` の version、`NEXT_PUBLIC_APP_VERSION` 環境変数
- 連動: REQ-063（モバイルヘッダー簡素化）。テーマ・言語・ユーザーメニューをドロワーに一元化する前提。

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: ドロワーは 1 タップ奥の画面なので直接のコンバージョンへの寄与は中程度だが、リピート・アイデンティティ訴求の観点で体験品質を大きく左右する。REQ-063 完了後に続けて実施するのが効率的。
