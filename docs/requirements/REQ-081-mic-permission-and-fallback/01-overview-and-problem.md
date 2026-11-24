## 要件概要

### 背景・目的
新規投稿フォームで「🎤 鳴き声で投稿」を録音しようとすると、ユーザーが許可を出していないにもかかわらず即座に **「マイク権限が必要です。ブラウザ/OS の設定から許可してください。」** が表示され、録音できない。

これは UI 上「ユーザーが拒否した」ように見えるが、**実際にはアプリのレスポンスヘッダがブラウザに対してマイク使用を全面禁止しているため**、`navigator.mediaDevices.getUserMedia({ audio: true })` が `NotAllowedError` を即座に投げて失敗している。

### 問題の特定（スモーキングガン）

**ファイル**: `next.config.ts:24`
```ts
{ key: 'Permissions-Policy', value: 'camera=(), microphone=()' },
```

`microphone=()` は **Permissions Policy の構文上「どのオリジンも不許可」** を意味する。`self` も含まれない。本番 / 開発を問わずアプリ全体でマイクが使えない状態。

正しくは `microphone=(self)` か、または **マイク使用ページのみ許可**する形にすべき。

加えて、現状の実装には以下のフォールバックも不足:
1. Permissions API での事前確認なし
2. Secure Context (HTTPS) チェックなし
3. In-App ブラウザ（LINE / X / Instagram 等）の検出なし
4. エラー時に OS / ブラウザ別の再設定手順を案内しない

### スコープ
**含む:**
- `next.config.ts` の Permissions-Policy 修正（`self` を許可）
- `AudioRecorder.tsx` の権限取得フローの強化
  - Permissions API での事前確認
  - Secure Context 検証
  - In-App ブラウザ検出
  - エラー種別ごとの詳細ガイダンス
- 拒否時の救済 UI 強化（ファイルアップロードへの自動誘導 + OS 別手順）
- i18n キー追加（OS 別手順の文言）
- AudioRecorder の単体テスト追加（getUserMedia / Permissions API モック）

**含まない:**
- ネイティブアプリ化
- 音声波形ビジュアライザの強化（既存維持）

### 前提条件・制約
- 本番環境は Vercel で HTTPS 強制
- 既存のセキュリティポリシー方針: 必要最小限の機能のみ許可
- React 19 + Next.js 15 + Web Audio API
- iOS Safari 16+ / Android Chrome / 主要 in-app browser をサポート対象とする

---
