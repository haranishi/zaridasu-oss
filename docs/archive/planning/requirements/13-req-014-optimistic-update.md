### REQ-014: 楽観的更新の導入

**背景**
投稿の編集・削除・いいね操作が、サーバーからのレスポンスを待ってから UI を更新するため、レイテンシが体感として遅く感じる。CommentSection のコメント削除は既に楽観的更新を実装している。

#### ユーザーストーリー

```
As a ユーザー,
I want to いいねや削除などの操作が即座に画面に反映されてほしい,
So that 操作のたびにローディングを待つ必要がなく、快適に使える。

受け入れ条件:
- [ ] いいね追加・取り消しが即座に UI に反映される（サーバーレスポンス待ちなし）
- [ ] 投稿削除が UI 上で即座に消える（サーバー確認後に確定）
- [ ] サーバーエラー時は UI がロールバックされ、エラーメッセージが表示される
- [ ] 楽観的更新中は「元に戻した」操作がないように UX を設計する
```

#### 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `useLike` hook にいいね・取り消しの楽観的更新を実装する | 高 |
| F2 | `useDeletePost` hook に削除の楽観的更新を実装する | 高 |
| F3 | エラー時のロールバック処理（元の状態に戻す）を各 hook に追加する | 高 |
| F4 | 楽観的更新中にローディングスピナーを表示しない（操作済み状態のみ表示） | 中 |
| F5 | 削除確認ダイアログを表示した後に楽観的削除を実行する | 中 |

#### 楽観的更新パターン

```javascript
// いいねの楽観的更新
async function toggleLike(postId, currentLiked) {
  // 1. 楽観的更新（即座に UI 変更）
  setPosts(prev => prev.map(p =>
    p.id === postId
      ? { ...p, liked: !currentLiked, likes_count: p.likes_count + (currentLiked ? -1 : 1) }
      : p
  ))

  // 2. サーバーへ反映
  const { error } = currentLiked
    ? await supabase.from('likes').delete().match({ post_id: postId, user_id })
    : await supabase.from('likes').insert({ post_id: postId, user_id })

  // 3. エラー時ロールバック
  if (error) {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, liked: currentLiked, likes_count: p.likes_count + (currentLiked ? 1 : -1) }
        : p
    ))
    toast.error('操作に失敗しました。もう一度お試しください。')
  }
}
```

---
