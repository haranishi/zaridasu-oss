## 🟠 重要

---

### REQ-005: テストカバレッジの拡大

**背景**
現在テストは5ファイルのみ（`PostCard.test.jsx`、`DonutChart.test.jsx` など）。認証フロー、投稿フォームのバリデーション、API エラーハンドリング、hooks に対するテストが存在しない。

#### ユーザーストーリー

```
As a 開発者,
I want to 主要機能に対するテストが存在する状態にしたい,
So that リグレッションを早期に検出でき、安心してリファクタリングできる。

受け入れ条件:
- [ ] 全 hooks（usePostForm, useDeletePost, useReverseGeocode, useStats）に unit test が存在する
- [ ] PostForm の全バリデーションロジックにテストが存在する
- [ ] API エラー発生時の挙動がテストされている
- [ ] 認証フローの主要パスにテストが存在する
- [ ] CI でテストが自動実行される
- [ ] カバレッジが 60% 以上（目標: 80%）
```

#### 機能要件

| # | テスト対象 | テスト種別 | 優先度 |
|---|-----------|-----------|--------|
| F1 | `usePostForm.js` - バリデーション（honeypot, count, comment, 写真制限） | Unit | 高 |
| F2 | `usePostForm.js` - スパムチェック（localStorage 操作含む） | Unit | 高 |
| F3 | `useDeletePost.js` - 削除成功・Storage失敗・DB失敗パターン | Unit | 高 |
| F4 | `useReverseGeocode.js` - 成功・タイムアウト・マッチなし | Unit | 高 |
| F5 | `PostForm.jsx` - フォーム送信・バリデーションエラー表示 | Integration | 高 |
| F6 | `CommentSection.jsx` - コメント投稿・削除・権限チェック | Integration | 中 |
| F7 | `AuthModal.jsx` - ログイン・サインアップ・エラー表示 | Integration | 中 |
| F8 | `AuthCallbackPage.jsx` - メール確認フロー | Integration | 中 |
| F9 | `HomePage.jsx` - フィルタ変更・データ取得・エラー状態 | Integration | 低 |
| F10 | CI（GitHub Actions）での自動テスト実行 | CI/CD | 高 |

#### テスト環境

```
- フレームワーク: Vitest（現行）+ React Testing Library
- モック: Supabase クライアントのモック（vi.mock）
- MSW（Mock Service Worker）でネットワークモック
- カバレッジ: v8 provider
```

---
