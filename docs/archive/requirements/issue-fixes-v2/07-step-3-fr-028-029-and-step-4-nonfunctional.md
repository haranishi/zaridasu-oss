### FR-028: オフラインキュー容量管理
- **説明:** IndexedDB の容量を監視し、上限超過時にユーザーへ通知
- **対象ファイル:** `src/lib/offlineStore.ts`, `src/hooks/useOfflineQueue.ts`
- **処理:**
  - addPendingPost 前に `navigator.storage.estimate()` で残容量確認
  - 残容量 < 10MB の場合は警告表示
  - 容量超過時は toast.error() で通知し、保存を拒否

### FR-029: オフラインキュー送信排他制御
- **説明:** 「すべて送信」ボタンの連打で重複送信されないよう排他制御
- **対象ファイル:** `src/hooks/useOfflineQueue.ts`
- **処理:**
  - `sendingRef` (useRef<boolean>) で排他制御
  - sendAll 開始時に true チェック → true なら早期 return
  - 完了/エラー時に false に戻す

---

## Step 4: 非機能要件

### パフォーマンス
- **初回表示:** LCP < 2.5秒（FR-005 Image最適化, FR-009 キャッシュで達成）
- **インタラクション:** FID < 100ms（FR-006 Context メモ化で達成）
- **累積レイアウトシフト:** CLS < 0.1（FR-005 Image の width/height 指定で達成）
- **同時接続:** 100ユーザー（Vercel サーバーレスで自動スケール）
- **データ量:** 投稿 10,000件以下（QUERY_LIMITS.posts = 2000 でページネーション済み）

### セキュリティ
- **認証:** Supabase Auth（JWT ベース）、管理者ルートは DB 検証付き
- **認可:** RLS で全テーブルの行レベルアクセス制御
- **入力サニタイズ:** クライアント + DB CHECK 制約の二重検証
- **ヘッダー:** CSP + HSTS + X-Frame-Options + X-Content-Type-Options + Referrer-Policy + Permissions-Policy + X-XSS-Protection
- **通信:** HTTPS 強制（HSTS）

### 可用性・信頼性
- **稼働率:** 99.9%（Vercel SLA）
- **バックアップ:** Supabase 自動バックアップ（日次）
- **オフライン:** IndexedDB による投稿キュー（最大10件、容量監視付き）
- **エラーフォールバック:** error.tsx でグローバルキャッチ、toast でユーザー通知

### アクセシビリティ
- **WCAG 2.1 AA 準拠:**
  - コントラスト比 4.5:1 以上（テキスト）、3:1 以上（大テキスト・UI）
  - フォーカス可視・フォーカストラップ（モーダル）
  - キーボードナビゲーション完全対応
  - 全画像に alt 属性
  - 全フォーム要素に label
  - aria-label / aria-labelledby / aria-describedby の適切な使用

### レスポンシブ対応
- **既存:** Tailwind CSS のモバイルファースト設計
- **ブレークポイント:** sm(640px) / md(768px) / lg(1024px) / xl(1280px)
- **対応不要:** 本タスクでレスポンシブ変更なし

---
