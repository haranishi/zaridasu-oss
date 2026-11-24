### REQ-013: フォーカス管理の改善

**背景**
モーダル（FilterBar のドロップダウン、AuthModal、PostForm）を閉じた際にフォーカスが適切に復帰しない。スクリーンリーダーや键盘ナビゲーションユーザーが迷子になる。WCAG 2.1 AA 基準の達成のために必要。

#### ユーザーストーリー

```
As a キーボードのみで操作するユーザー,
I want to モーダルを閉じた後に前の操作位置にフォーカスが戻ってほしい,
So that 画面のどこにいるか分からなくなることなく操作を続けられる。

受け入れ条件:
- [ ] モーダル・ダイアログを開く際に最初のフォーカス可能要素にフォーカスが移動する
- [ ] モーダルを閉じる際にトリガーした要素にフォーカスが復帰する
- [ ] モーダル内でTab キーを押すとフォーカスがモーダル内に閉じ込められる（フォーカストラップ）
- [ ] Escape キーでモーダルを閉じることができる
- [ ] フォーカスインジケーターが視覚的に明確である（カラーコントラスト 3:1 以上）
```

#### 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `useFocusTrap` カスタムフックを作成し、モーダル内のフォーカスをトラップする | 高 |
| F2 | モーダルを開く際に `firstFocusableElement.focus()` を実行する | 高 |
| F3 | モーダルを閉じる際に `triggerElement.focus()` を実行する | 高 |
| F4 | AuthModal, PostForm, FilterBar ドロップダウンに適用する | 高 |
| F5 | Escape キーで閉じる処理を全モーダルに追加する | 中 |
| F6 | フォーカスリングを Tailwind の `focus-visible:ring-2` で統一する | 中 |

#### 実装指針

```javascript
// useFocusTrap フック
function useFocusTrap(ref, isActive) {
  useEffect(() => {
    if (!isActive) return
    const focusables = ref.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    first?.focus()

    const handleKey = (e) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isActive])
}
```

---
