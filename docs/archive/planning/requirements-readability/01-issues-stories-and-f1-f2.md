
## 現状の課題サマリー

1. **文字が小さすぎる**: `text-xs`（12px）がアプリ全域で多用されている。WCAG AA は本文テキスト最低 14px を推奨
2. **コントラスト不足**: `text-gray-400`（コントラスト比 2.8:1）が日付・市区町村・コメント等に常用。WCAG AA 基準 4.5:1 を下回る
3. **テキスト省略で内容が見えない**: PostCard のコメント、地図ポップアップが `truncate` / `line-clamp` で途切れ、全文確認手段がない
4. **ダークモードのコントラストが更に悪い**: `text-slate-400/500/600` が暗い背景で判読困難
5. **チャートラベルが極小**: BarChart のラベルが `fontSize: 10`（10px）で数値が読めない

---

## ユーザーストーリー

| # | 対象ユーザー | やりたいこと | 理由 | 受け入れ条件 |
|---|------------|------------|------|------------|
| US1 | 全ユーザー | 投稿カードの情報（市区町村、コメント、日時）を無理なく読みたい | 現状12pxの薄いグレーで目を凝らす必要がある | 本文テキスト14px以上、コントラスト比4.5:1以上 |
| US2 | 地図利用者 | 地図ポップアップの情報を一目で把握したい | text-xs + gray-400 で判読困難。コメントが途中で切れる | ポップアップテキスト14px以上、コメント3行表示 |
| US3 | ダークモード利用者 | 暗い背景でも文字が読みたい | slate-400/500 が暗い背景に溶け込む | ダークモードでもコントラスト比4.5:1以上 |
| US4 | 高齢者・視力が弱い人 | スマホでもストレスなく読みたい | 12pxのテキストはスマホで特に辛い | モバイルでも最小14px |
| US5 | トレンド分析者 | チャートの数値・ラベルを正確に読みたい | 10pxのラベルでは数値が判別できない | チャートラベル12px以上 |

---

## 機能要件

### F1: フォントサイズの底上げ（text-xs → text-sm）

**ルール**: アプリ内で `text-xs`（12px）を使用してよいのは**補助ラベル・バッジ内テキスト・著作権表記のみ**。それ以外は `text-sm`（14px）以上とする。

**対象コンポーネントと変更箇所**:

| コンポーネント | 現状 | 変更後 | 行（参考） |
|-------------|------|--------|-----------|
| **PostCard.jsx** | 情報種別バッジ: `text-xs` | `text-xs` 維持（バッジは例外） | 67 |
| **PostCard.jsx** | 市区町村+個体数: `text-xs` | `text-sm` | 100 |
| **PostCard.jsx** | コメント: `text-xs truncate` | `text-sm line-clamp-2`（後述 F3） | 114 |
| **PostCard.jsx** | 日時: `text-xs` | `text-sm` | 117 |
| **StatsBar.jsx** | バー全体: `text-xs` | `text-sm` | 54 |
| **StatsBar.jsx** | 前月比: `text-[10px]` | `text-xs` | 73 |
| **FilterBar.jsx** | エリア/フィルターボタン: `text-xs` | `text-sm` | 79, 97 |
| **FilterBar.jsx** | ドロワーラベル: `text-xs` | `text-sm` | 144-171 |
| **MapView.jsx** | ポップアップ情報種別: `text-xs` | `text-sm` | 234 |
| **MapView.jsx** | ポップアップ市区町村: `text-xs` | `text-sm` | 239 |
| **MapView.jsx** | ポップアップコメント: `text-xs` | `text-sm` | 242 |
| **MapView.jsx** | 「詳細 →」リンク: `text-xs` | `text-sm` | 248 |
| **BarChart.jsx** | 軸ラベル: `fontSize: 10` | `fontSize: 12` | 27 |
| **Footer.jsx** | コピーライト: `text-xs` | `text-xs` 維持（補助テキスト例外） | 29 |
| **CommentSection** | タイムスタンプ: `text-xs` | `text-sm` | — |

### F2: コントラスト比の改善（WCAG AA 4.5:1）

**ライトモード**:

| 現状クラス | コントラスト比 | 変更後クラス | コントラスト比 |
|-----------|------------|-----------|------------|
| `text-gray-400` (#9CA3AF) | 2.8:1 ❌ | `text-gray-500` (#6B7280) | 4.6:1 ✅ |
| `text-gray-500` (#6B7280) | 4.6:1 (ギリギリ) | `text-gray-600` (#4B5563) | 7.0:1 ✅✅ |

**ダークモード**（背景: `bg-slate-900` #0F172A / `bg-slate-950` #020617）:

| 現状クラス | 変更後クラス | 理由 |
|-----------|-----------|------|
| `dark:text-slate-600` | `dark:text-slate-400` | slate-600 は暗い背景に溶ける |
| `dark:text-slate-500` | `dark:text-slate-400` | コントラスト確保 |
| `dark:text-slate-400` | 維持（本文用に適切） | — |

**対象コンポーネントと変更箇所**:

| コンポーネント | 現状 | 変更後 |
|-------------|------|--------|
| **PostCard.jsx:100** | 市区町村: `text-gray-400` / `text-slate-500` | `text-gray-500` / `text-slate-400` |
| **PostCard.jsx:114** | コメント: `text-gray-500` / `text-slate-400` | `text-gray-600` / `text-slate-300` |
| **PostCard.jsx:117** | 日時: `text-gray-400` / `text-slate-600` | `text-gray-500` / `text-slate-400` |
| **StatsBar.jsx:62,69,71** | ラベル: `text-gray-500` / `text-slate-500` | `text-gray-600` / `text-slate-400` |
| **MapView.jsx:234** | 情報種別: `text-gray-500` | `text-gray-600` |
| **MapView.jsx:239** | 市区町村: `text-gray-400` | `text-gray-600` |
| **MapView.jsx:242** | コメント: `text-gray-600` | 維持 |
| **Footer.jsx:9** | 本文: `text-gray-500` / `text-slate-400` | 維持（フッターは補助的） |
| **Footer.jsx:29** | コピーライト: `text-gray-400` / `text-slate-600` | `text-gray-500` / `text-slate-500` |
| **FilterBar.jsx:83-84** | ボタン: `text-slate-500` / `text-gray-500` | `text-slate-400` / `text-gray-600` |
| **FilterBar.jsx:144-171** | ラベル: `text-gray-500` / `text-slate-400` | `text-gray-600` / `text-slate-300` |
