## 機能要件

### FR-081-01: Permissions-Policy ヘッダの是正
- **説明:** `next.config.ts` の `Permissions-Policy: camera=(), microphone=()` を `microphone=(self)` に変更（カメラは引き続き不要なら `()` のままで OK）
- **設定値:** `'camera=(), microphone=(self)'`
- **検証:** デプロイ後、レスポンスヘッダで `microphone=(self)` を確認

### FR-081-02: Permissions API での事前確認
- **説明:** `navigator.permissions.query({ name: 'microphone' })` で事前に状態を取得
- **状態の扱い:**
  - `granted` → 即座に getUserMedia を呼んで録音開始
  - `prompt` → getUserMedia を呼ぶ（ブラウザがダイアログを出す）
  - `denied` → 権限拒否 UI へ（getUserMedia は呼ばない）
- **入力:** なし
- **出力:** state: 'granted' | 'prompt' | 'denied' | 'unknown'
- **エラーハンドリング:** Permissions API 非対応ブラウザでは従来通り getUserMedia を呼ぶ

### FR-081-03: Secure Context / In-App ブラウザの検出
- **説明:** 録音前にコンテキスト要件を確認
- **処理:**
  1. `window.isSecureContext === false` → 「HTTPS 接続が必要です」エラー
  2. UA で in-app browser を判定:
     - LINE: `Line/`
     - X (Twitter): `Twitter for`, `TwitterBrowser`
     - Instagram: `Instagram`
     - Facebook: `FBAN|FBAV`
     - 該当時 → 「外部ブラウザで開いてください」エラー + 共有 / リンクコピーボタン
- **配置:** `AudioRecorder.tsx` の startRecording 冒頭

### FR-081-04: エラー種別の詳細化と再設定ガイド
- **説明:** `getUserMedia` のエラー種別ごとに UI を分岐
- **エラー名 → メッセージ対応:**
  | name | UI |
  |---|---|
  | `NotAllowedError` / `PermissionDeniedError` | 「許可方法を見る」リンク付き拒否表示 |
  | `NotFoundError` | 「マイクが接続されていません」 |
  | `NotReadableError` | 「他のアプリがマイクを使用中の可能性があります」 |
  | `OverconstrainedError` | 「マイクが要求された設定をサポートしていません」 |
  | `SecurityError` | 「セキュリティ設定によりマイクが利用できません」 |
  | `AbortError` | 「録音がブラウザに中断されました」 |
  | その他 | 「録音を開始できませんでした」 |

### FR-081-05: 「許可方法を見る」モーダル / セクション
- **説明:** 拒否時に各 OS / ブラウザの手順を表示
- **構成:**
  - iOS Safari: 設定 → Safari → カメラ・マイク → 許可
  - iOS Chrome: 設定 → Chrome → マイク → ON
  - Android Chrome: アドレスバーの 🔒 → サイトの設定 → マイク
  - macOS Safari: メニュー Safari → 設定 → Web サイト → マイク
  - Windows Chrome: アドレスバーの 🔒 → サイトの設定 → マイク
- **検出:** UA から OS / ブラウザを判定して該当手順を冒頭にハイライト

### FR-081-06: 拒否時の自動フォールバック
- **説明:** 拒否時に **mode='upload'** へ自動切替し、ファイル選択 UI を即座に提示
- **挙動:**
  - 「録音する」タブはグレーアウト but クリックは可能（再試行用）
  - 「ファイルを選択」タブが選択状態になり、ボタンがアクティブ
  - エラーメッセージは小さく上部に残す（強制弾きしない）

### FR-081-07: AudioRecorder のテスト追加
- **対象:** `src/components/features/posts/__tests__/AudioRecorder.test.tsx`
- **シナリオ:**
  - getUserMedia モック: granted / NotAllowedError / NotFoundError
  - Permissions API モック: granted / prompt / denied / 非対応
  - In-App ブラウザ UA でレンダリング
  - HTTP context (`isSecureContext: false`) でレンダリング
- **期待される結果:** 各シナリオで正しい UI 文言と state 遷移

---
