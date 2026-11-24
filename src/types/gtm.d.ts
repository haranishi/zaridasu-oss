// REQ-232: window.dataLayer の型宣言を一本化する。
// 各コンポーネントでの重複 declare（旧 WebVitalsReporter.tsx 等）はここへ集約する。
export {}

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}
