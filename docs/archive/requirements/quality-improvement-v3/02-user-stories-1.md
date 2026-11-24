## Step 2: ユーザーストーリー

### US-001: セキュリティ強化
**As a** システム管理者,
**I want to** XSS・入力改ざん・不正アクセスのリスクを最小化したい,
**So that** ユーザーデータと投稿の安全性が確保される.

**受け入れ条件:**
- [ ] AC-1: CSP ヘッダーから `unsafe-inline`/`unsafe-eval` を除去し、nonce ベースに移行する
- [ ] AC-2: posts テーブルに `is_anonymous=false → user_id NOT NULL` の CHECK 制約を追加する
- [ ] AC-3: Supabase ミドルウェアで try-catch によるエラーハンドリングを実装する
- [ ] AC-4: RPC 呼び出しにクライアント側スロットリング（1秒間隔）を導入する
- [ ] AC-5: useEditPost に usePostForm と同等のバリデーション（comment 長, count 範囲, 座標範囲）を実装する

**優先度:** 高
**見積もり:** L

---

### US-002: パフォーマンス最適化
**As a** 一般ユーザー,
**I want to** ページ遷移・データ読み込みが高速でメモリ使用量が安定していてほしい,
**So that** 低スペック端末やモバイル回線でも快適に使える.

**受け入れ条件:**
- [ ] AC-1: RPC 呼び出しを Promise.race でキャンセル可能にする（タイムアウト 10 秒）
- [ ] AC-2: sessionStorage キャッシュの TTL 期限切れエントリをクリーンアップする
- [ ] AC-3: ImageProcessor の _pending Map に上限（10件）を設ける
- [ ] AC-4: Leaflet アイコンキャッシュを LRU（上限 20 件）にする
- [ ] AC-5: MapView 読み込み時にスケルトン UI を表示する
- [ ] AC-6: 写真アップロードロールバックに 10 秒タイムアウトを設ける

**優先度:** 高
**見積もり:** L

---

### US-003: アクセシビリティ改善
**As a** キーボード・スクリーンリーダーを使用するユーザー,
**I want to** すべてのモーダル・フォーム・通知を支援技術で操作できるようにしたい,
**So that** WCAG 2.1 AA 準拠のアクセシブルな体験が得られる.

**受け入れ条件:**
- [ ] AC-1: PostForm モーダルにフォーカストラップを実装する
- [ ] AC-2: 投稿写真に「{種類}の{情報種別}写真 - {市区町村}」形式の alt テキストを生成する
- [ ] AC-3: Toast 通知に `aria-atomic="true"` を追加する
- [ ] AC-4: PostForm の全フォームフィールドに `<label>` 要素を追加する
- [ ] AC-5: Header のアイコンボタンに `aria-label` を追加する

**優先度:** 高
**見積もり:** M

---

### US-004: PWA 強化
**As a** オフライン環境のフィールド調査員,
**I want to** デプロイ後に最新版が自動反映され、オフライン投稿が接続復帰時に自動送信されてほしい,
**So that** 圏外の調査現場でも確実にデータを記録できる.

**受け入れ条件:**
- [ ] AC-1: Service Worker キャッシュ名にビルドハッシュを含め、デプロイ時に旧キャッシュを自動削除する
- [ ] AC-2: manifest.ts に screenshots・categories・related_applications を追加する
- [ ] AC-3: Service Worker が API エラー（4xx/5xx）とネットワークエラーを区別して処理する
- [ ] AC-4: Background Sync API でオフライン投稿を自動再送する

**優先度:** 中
**見積もり:** L

---

