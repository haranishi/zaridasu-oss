## 🔵 UX

---

### REQ-012: モバイルキーボード表示時のフォーム対応

**背景**
`PostForm.jsx` は `max-h-[92dvh]` で高さを制限しているが、モバイルでソフトウェアキーボードが表示されると有効な画面高さが減少し、フォームの下部（送信ボタンなど）が隠れる可能性がある。`visualViewport` API の利用は Homepage の FAB 位置調整のみに使用されている。

#### ユーザーストーリー

```
As a モバイルユーザー,
I want to スマートフォンで投稿フォームを入力するとき、送信ボタンが常に見える状態にしたい,
So that フォームを送信するためにスクロールする必要がない。

受け入れ条件:
- [ ] キーボード表示時でも送信ボタンが画面内に表示される
- [ ] フォームはキーボード表示に応じて高さを動的に調整する
- [ ] フォーム内の入力フィールドにフォーカスするとキーボード上に見切れない
- [ ] iOS Safari と Android Chrome の両方で動作する
- [ ] フォーム内の重要フィールド（地図、送信ボタン）が常にアクセス可能
```

#### 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `visualViewport.height` を使用してフォームの最大高さを動的に計算する | 高 |
| F2 | 送信ボタンを `sticky bottom-0` で固定し、常に画面下部に表示する | 高 |
| F3 | フォームフィールドにフォーカスが当たった際に `scrollIntoView()` で表示する | 中 |
| F4 | iOS の `env(safe-area-inset-bottom)` に対応する | 中 |

#### 実装指針

```javascript
// visualViewport でキーボード高さを計算
useEffect(() => {
  const handler = () => {
    const vh = window.visualViewport?.height ?? window.innerHeight
    setFormMaxHeight(`${vh - HEADER_HEIGHT}px`)
  }
  window.visualViewport?.addEventListener('resize', handler)
  return () => window.visualViewport?.removeEventListener('resize', handler)
}, [])
```

```jsx
{/* 送信ボタンを sticky で固定 */}
<div className="sticky bottom-0 bg-white dark:bg-gray-900 pt-3 pb-[env(safe-area-inset-bottom)]">
  <button type="submit">投稿する</button>
</div>
```

---
