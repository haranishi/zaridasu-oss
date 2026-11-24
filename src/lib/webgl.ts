/**
 * REQ-250 FR-250-04 フェーズ2 / NFR-250-01: WebGL 対応判定（SSR 安全）。
 *
 * 3D ビューアは WebGL が使える環境でのみ提供し、非対応時は 2D SVG にフォールバックする
 * （FR-250-04(iii)）。判定に `three` を import しないことが分離の要——この関数はコレクション用
 * チャンクに含まれるが、three を一切引き込まない軽量な context 生成テストだけを行う。
 *
 * @returns WebGL(2) コンテキストを生成できれば true。SSR・非対応・例外時は false。
 */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    // webgl2 → webgl → experimental-webgl の順に確認（古い環境も拾う）。
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    return gl != null
  } catch {
    // getContext がスローする実装（一部の古い/制限環境）でも安全に false。
    return false
  }
}
