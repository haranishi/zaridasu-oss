# REQ-069: 投稿フォームに音声録音 UI 追加

## 背景
ウシガエル（American Bullfrog, *Lithobates catesbeianus*）の識別は、夜間や草むら・水辺の茂みなど視認困難な状況では「姿」よりも「鳴き声」の方が遥かに特徴的で決定的なシグナルになる。現状のザリダスは `src/components/features/posts/PostForm.tsx` と `PhotoUploadSection.tsx` による写真投稿のみを前提としており、音声という重要なエビデンス経路を取りこぼしている。

**ユーザーストーリー**:
- 調査員として、夜間に田んぼの脇でウシガエルの鳴き声を聞いたが姿は見えないとき、スマホを向けて 10 秒録音し、その場で「鳴き声で投稿」したい。そうすれば写真が撮れなくても分布情報に貢献できる。
- 高齢の住民として、暗所で写真撮影が困難な環境でも、スマートフォンに向かって喋りかけるような直感的操作で通報したい。

## 現状の問題
- 現在は写真のみで種判定、音声投稿・判定ができない
- 夜行性種（ウシガエル）の最大の識別特徴である鳴き声を活かせない
- `PostForm.tsx:20` で `PhotoUploadSection` のみ import しており、マイク入力 UI が存在しない
- iOS Safari の `getUserMedia` は最初のユーザー操作（タップ）直後でないと権限プロンプトがブロックされるが、そもそも呼び出す UI が無い

## 要件

### 機能要件
- [ ] FR-069-01: `src/components/features/posts/PostForm.tsx` のフォーム内、写真アップロード欄（`PhotoUploadSection`）の直下に「🎤 鳴き声で投稿」セクションを追加する。新規コンポーネント `src/components/features/posts/AudioRecorder.tsx` を作成して組み込む。
- [ ] FR-069-02: 録音ボタン（🎤 アイコン + ラベル「鳴き声を録音」）をタップすると `navigator.mediaDevices.getUserMedia({ audio: true })` を呼び出し、ユーザー操作と同じタスク内で権限要求する（iOS Safari 14.5+ の制約対応）。
- [ ] FR-069-03: `MediaRecorder` API を使用して録音。MIME 型は `audio/webm;codecs=opus` を優先、未対応の iOS Safari では `audio/mp4` にフォールバック（`MediaRecorder.isTypeSupported` で判定）。
- [ ] FR-069-04: 録音時間は最大 10 秒。10 秒経過時に自動停止（`setTimeout` + `mediaRecorder.stop()`）。途中停止ボタンも提供。
- [ ] FR-069-05: 録音中は `AudioContext` + `AnalyserNode` で `getByteFrequencyData` を取得し、`<canvas>` または CSS バー群でリアルタイム波形/レベルメーターを描画する。`requestAnimationFrame` で 60fps 以下に制限。
- [ ] FR-069-06: 録音終了後、`<audio src={Blob URL} controls>` でプレビュー再生可能。「再録音」「破棄」「この録音を使う」の 3 ボタンを提示。
- [ ] FR-069-07: 送信時はそのまま Blob（webm/opus または mp4）を Supabase Storage にアップロードする。サーバー側（REQ-072 の Edge Function）で Gemini が直接受け付けられる形式に変換する方針とし、ブラウザ側での mp3 再エンコード（ffmpeg.wasm）は**行わない**（バンドルサイズ節約）。
- [ ] FR-069-08: 既存の `usePostForm` フックに `audioBlob: Blob | null` と `setAudioBlob` を追加し、送信ロジックが写真と同じ粒度で扱えるようにする。
- [ ] FR-069-09: 写真なし・音声のみ投稿を許可する（species フィールドは従来通り必須。写真 or 音声の少なくとも一方は必須とする送信前バリデーションを追加）。

### 非機能要件
- [ ] NFR-069-01: アクセシビリティ — 録音開始/停止/完了の状態変化を `aria-live="polite"` の領域で日本語アナウンスする（例: 「録音中です。残り 7 秒」「録音が完了しました」）。
- [ ] NFR-069-02: マイク権限が `NotAllowedError` / `NotFoundError` で拒否された場合、`ToastContext` で赤色トーストを表示し、「設定アプリからマイク権限を許可してください」を OS 別リンクなしで案内する。録音 UI は非活性化する。
- [ ] NFR-069-03: タップターゲット サイズは ≥44×44 px（iOS HIG / WCAG 2.5.5 Level AAA）。
- [ ] NFR-069-04: `prefers-reduced-motion: reduce` では波形アニメーションを停止し、静的な「録音中」ラベルに置換（REQ-015 の方針と一致）。
- [ ] NFR-069-05: Blob サイズは 10 秒 webm/opus で概ね 30〜80 KB、最大でも 500 KB を超えないこと。超えた場合は送信前に警告。
- [ ] NFR-069-06: ブラウザサポート — Chrome 90+, Firefox 85+, Safari 14.5+, Edge 90+。未対応ブラウザでは録音ボタンを非表示にして「このブラウザでは音声投稿に対応していません」を表示。

## API / データモデル仕様
本要件内では UI と Blob 保持まで。Storage 保存は REQ-070、DB カラムは REQ-071 に委譲。

`AudioRecorder.tsx` の props:
```ts
interface AudioRecorderProps {
  onRecorded: (blob: Blob, mimeType: string, durationMs: number) => void
  onCleared: () => void
  disabled?: boolean
  maxDurationMs?: number // default 10_000
}
```

## 受入条件
- [ ] AC-069-01: **Given** ユーザーが PostForm を開いている、**When** 「🎤 鳴き声を録音」ボタンをタップする、**Then** ブラウザのマイク権限プロンプトが表示され、許可後に録音が開始し、波形メーターが動き始める。
- [ ] AC-069-02: **Given** 録音中である、**When** 10 秒経過する、**Then** 録音が自動停止し、プレビュー `<audio>` 要素と「再録音 / 破棄 / この録音を使う」ボタンが表示される。
- [ ] AC-069-03: **Given** ユーザーが iOS Safari 14.5 を使用中、**When** 録音ボタンをタップする、**Then** 同タスク内で getUserMedia が呼ばれ、権限プロンプトが正常に出る（ブロックされない）。
- [ ] AC-069-04: **Given** マイク権限が拒否されている、**When** 録音ボタンをタップする、**Then** 赤色トーストで「マイク権限が必要です」が表示され、ボタンが disabled になる。
- [ ] AC-069-05: **Given** 写真 0 枚・音声 0 件、**When** 投稿ボタンを押す、**Then** 「写真または音声を少なくとも 1 つ追加してください」バリデーションエラーが出て送信されない。
- [ ] AC-069-06: **Given** 音声を録音済み・写真 0 枚、**When** 投稿ボタンを押す、**Then** 送信が成功する（音声のみ投稿が許可されている）。
- [ ] AC-069-07: 単体テスト（Vitest + @testing-library/react）で `AudioRecorder.tsx` の権限拒否パス・10 秒自動停止・再録音フローを検証する。

## 影響範囲
- 新規: `src/components/features/posts/AudioRecorder.tsx`
- 変更: `src/components/features/posts/PostForm.tsx`（音声セクション追加、送信バリデーション修正）
- 変更: `src/hooks/usePostForm.ts`（`audioBlob` 状態・送信時の Blob 受け渡し）
- 変更: `src/types/index.ts`（`PostFormData` に `audio?: Blob` 追加）
- 変更: `src/locales/ja.json` / `src/locales/en.json`（録音 UI の i18n キー `postForm.audio.*`）
- テスト: `src/components/features/posts/__tests__/AudioRecorder.test.tsx`

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: ウシガエル鳴き声は本アプリの分布調査価値を大きく高める新機軸データ。REQ-070〜073 の前段となるブロッキング要件で、UI がないと後続要件の検証すら不可能。
