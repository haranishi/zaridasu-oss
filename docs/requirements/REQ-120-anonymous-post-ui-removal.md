# REQ-120: 匿名投稿 UI を撤廃し「投稿はログイン必須」に統一する

## 背景
ザリダスは初期設計では「匿名投稿可能」だったが、運用ポリシーとスパム対策の都合で、現在は実装・DB・RLS のいずれもログイン必須に倒している。一方で UI 文言・README の機能一覧・PostForm のステート分岐には「匿名投稿」の名残が残っており、ユーザー体験と実装仕様が矛盾している。これは混乱だけでなく、未ログイン状態で投稿フォームを開いた際の隠れた実行時エラー（`currentUser!.id` の non-null assertion）を生む潜在バグでもある。

匿名投稿を本気で残すなら、Storage の owner 別パス、RLS の anonymous 用ポリシー、IP ベースのレート制限、ハニーポット強化などの再設計が必要で、本要件のスコープを超える。本 REQ では「短期的にログイン必須に揃える」ことに限定する。

## 現状の問題

### 1. PostForm に未ログイン用 UI が残っている
`src/components/features/posts/PostForm.tsx:245-269` で `currentUser` の有無により以下を出し分けている。
- ログイン時: 「ログインユーザーとして投稿します」（`postForm.loggedInPost`）
- 未ログイン時: 「匿名で投稿します」＋「ログインする」リンク（`postForm.anonymousPost` / `postForm.anonymousLink` / `postForm.anonymousDesc`）

しかし送信処理 `src/hooks/usePostForm.ts:306-307` は以下の通り、未ログインでは絶対に通らない：
```ts
user_id: currentUser!.id,
is_anonymous: false,
```

さらに DB 側 `supabase/schema.sql:494-496` の RLS ポリシー `auth_insert` は `TO authenticated WITH CHECK (auth.uid() = user_id)` なので、未認証 INSERT は RLS で拒否される。

### 2. README の機能説明が「匿名投稿にも対応」のまま
`README.md:16` に「匿名投稿にも対応」、`README.md:216` に「レートリミット: 認証ユーザー 5 件/24h、匿名 3 件/分（DB トリガーで強制）」「is_anonymous 不変性」の記述が残っている。実装と齟齬。

### 3. BottomNav・各種導線で「未ログインでも投稿フォームを開ける」フローが残る
`src/app/(home)/HomeInteractive.tsx:148` の `handlePostClick = () => dispatch({ type: 'OPEN_POST_FORM' })` は未ログインでも PostForm を開く。フォーム送信時に DB エラー or non-null assertion で落ちる経路がある。

### 4. i18n キーに匿名投稿用の文言が残存
`postForm.anonymousPost` / `postForm.anonymousLink` / `postForm.anonymousDesc` 等。削除するキーの洗い出しが必要。

### 5. DB 側の `is_anonymous` カラムと関連トリガー
- `posts.is_anonymous BOOLEAN DEFAULT TRUE NOT NULL`（schema.sql:24）
- `protect_anonymous_flag()` トリガー（schema.sql:195-212）= イミュータブル化
- `chk_user_id_required` 制約（schema.sql:62-63）= `is_anonymous = true OR user_id IS NOT NULL`

RLS で未認証 INSERT は禁止され `is_anonymous: false` 固定で送られているため、現行データの `is_anonymous = true` は古い匿名投稿（マイグレーション以前）のみ。本 REQ では DB スキーマには触れず、UI とアプリ層に限定する（DB 側の整理は別 REQ で）。

## 目的
- 「投稿にはログインが必要」を全画面で一貫した体験にする。
- PostForm を未ログインで開かない（または開いても送信ボタンが出ない）ことで、隠れた実行時エラーを排除する。
- README・i18n・UI の文言を実装と一致させる。

## 要件

### 機能要件
- [ ] FR-120-01: `HomeInteractive.tsx` の `handlePostClick` を「未ログインなら AuthModal を `signup` タブで開く」に変更する。`OPEN_POST_FORM` を dispatch するのは認証済みのときだけ。
- [ ] FR-120-02: `BottomNav.tsx` の投稿ボタンも同様に、未ログインなら AuthModal（signup タブ）を開く。
- [ ] FR-120-03: `PostForm.tsx:245-269` の `currentUser` 三項演算を削除し、ログイン済み案内のみを残す。匿名投稿用バナー（`postForm.anonymousPost` 等）を撤去する。
- [ ] FR-120-04: `usePostForm.ts:306-307` で `is_anonymous: false` は維持しつつ、`currentUser!` の non-null assertion を `if (!currentUser) return false` の早期 return に置き換える（防御的）。
- [ ] FR-120-05: i18n キー `postForm.anonymousPost` / `postForm.anonymousLink` / `postForm.anonymousDesc` を `src/locales/**` から削除し、`scripts/check-i18n-parity.ts` でパリティを確認する。
- [ ] FR-120-06: README.md の以下を修正：
  - 機能一覧から「匿名投稿にも対応」（line 16 付近）を削除
  - セキュリティ章のレートリミット記述（line 216）から「匿名 3 件/分」を削除（DB トリガーは残るが UI からは到達不能のため）
  - 「is_anonymous 不変性」の文言は残してよい（DB 防御として保持）

### 非機能要件
- [ ] NFR-120-01: PostForm を未ログインで直接マウントする経路がないことを Playwright で検証（`tests/e2e/post.spec.ts` に「未ログイン → 投稿ボタン → AuthModal 表示」のステップを追加）。
- [ ] NFR-120-02: 既存の認証済み投稿フローのテスト（`src/components/features/posts/__tests__/PostForm.a11y.test.tsx`、`tests/e2e/post.spec.ts`）が引き続きパスする。

## 受入条件
- [ ] AC-01: 未ログインでホームの「+」ボタンタップ → AuthModal が `signup` タブで開く。PostForm は出ない。
- [ ] AC-02: 未ログインで BottomNav の投稿ボタンタップ → 同様に AuthModal。
- [ ] AC-03: PostForm を開いた状態で `data-testid` などで「匿名投稿」「ログインせずに投稿」の文字列が DOM に存在しないこと。
- [ ] AC-04: `git grep -i "anonymousPost\|anonymousLink\|anonymousDesc" src/` の結果が空。
- [ ] AC-05: README.md に「匿名投稿」の文字列が残っていない（DB トリガーのカラム名 `is_anonymous` を除く）。
- [ ] AC-06: 既存ユーザーの投稿フローが回帰なく動く（手動 smoke + E2E）。

## 影響範囲
- 変更対象ファイル
  - `src/components/features/posts/PostForm.tsx`
  - `src/hooks/usePostForm.ts`
  - `src/app/(home)/HomeInteractive.tsx`
  - `src/components/layout/BottomNav.tsx`
  - `src/locales/ja/translation.json`, `src/locales/en/translation.json`（i18n キー削除）
  - `README.md`
- 影響しないこと
  - DB スキーマ（`posts.is_anonymous` カラム、`protect_anonymous_flag` トリガー、`chk_user_id_required` 制約は据え置き）
  - RLS ポリシー（既に `auth_insert` で対応済み）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 仕様矛盾は信頼性を毀損する。未ログインで PostForm に到達できる現状は「フォーム入力後の送信失敗」というワーストケースを生み、ユーザーの作業をムダにする。実装変更は浅く、テストも既存資産で大半をカバーできる。
