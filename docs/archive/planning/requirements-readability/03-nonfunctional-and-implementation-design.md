## 非機能要件

| 項目 | 要件 |
|-----|------|
| WCAG 2.1 AA コントラスト | 通常テキスト: 4.5:1 以上。大テキスト（18px太字 or 24px）: 3:1 以上 |
| 最小フォントサイズ | 本文テキスト: 14px（`text-sm`）以上。バッジ/補助ラベル: 12px（`text-xs`）許容 |
| ダークモード | ライトモードと同等のコントラスト比を確保 |
| レスポンシブ | モバイル（375px幅）でもフォントサイズを維持（レスポンシブで更に小さくしない） |
| 視認性テスト | Chrome DevTools の Rendering > Emulate vision deficiencies で色覚異常者にも情報が伝わること |

---

## 実装設計

### 変更ファイル一覧

**高優先（ユーザー接触面積が大きいコンポーネント）**:

| ファイル | 主な変更 |
|---------|---------|
| `src/components/features/posts/PostCard.jsx` | フォントサイズ↑、コントラスト↑、truncate→line-clamp-2+title、サムネイル拡大 |
| `src/components/features/map/MapView.jsx` | ポップアップのフォント・コントラスト・minWidth・line-clamp改善 |
| `src/components/features/dashboard/StatsBar.jsx` | text-xs→text-sm、コントラスト↑、前月比text-[10px]→text-xs |
| `src/components/features/dashboard/FilterBar.jsx` | ボタン・ラベルのフォント・コントラスト改善 |

**中優先**:

| ファイル | 主な変更 |
|---------|---------|
| `src/pages/TrendsPage.jsx` | KPIラベル・内訳テキスト・バー高さ改善 |
| `src/components/features/admin/BarChart.jsx` | 軸ラベルfontSize: 10→12、色改善 |
| `src/components/layout/Footer.jsx` | コピーライトのコントラスト改善 |
| `src/components/features/posts/CommentSection.jsx` | タイムスタンプのフォント・コントラスト改善 |
| `src/components/layout/Header.jsx` | truncated テキストにtitle属性追加 |

**低優先**:

| ファイル | 主な変更 |
|---------|---------|
| `src/components/features/posts/PostForm.tsx` | フォームラベル text-xs→text-sm |
| `src/components/modals/EditDialog.jsx` | フォームラベル text-xs→text-sm |
| `src/components/modals/AuthModal.jsx` | ラベル・ベネフィットtext改善 |
| `src/pages/DetailPage.jsx` | muted/faint クラスのコントラスト見直し |

---
