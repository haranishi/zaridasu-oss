## 非機能要件

| 項目 | 要件 |
|-----|------|
| パフォーマンス | 20件のカード描画が 500ms 以内。ミニマップは遅延読み込みで初期描画をブロックしない |
| アクセシビリティ | カード全体が `article` 要素。アクションボタンに `aria-label`。フォーカス順序が論理的 |
| ダークモード | 現在の管理画面はダークモード非対応だが、将来対応のために `dark:` クラスを準備 |
| レスポンシブ | 最小幅 320px（iPhone SE）で操作可能 |
| ブラウザ | Chrome/Safari/Firefox 最新版 |

---

## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `src/components/features/admin/ReviewCard.jsx` | 審査カード（1投稿分のカード型コンポーネント） |
| `src/components/features/admin/ReviewCardAI.jsx` | カード内 AI判定セクション（常時展開版） |
| `src/components/features/admin/ReviewCardMiniMap.jsx` | カード内ミニマップ（遅延読み込み Leaflet） |
| `src/components/features/admin/BulkActionBar.jsx` | フローティング一括操作ツールバー |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/pages/admin/AdminPostsPage.jsx` | 審査待ちタブでカードレイアウトを使用。テーブルのフォントサイズ拡大。一括承認追加 |

---

