/**
 * vitest 5 用の jest-dom 型ブリッジ。
 *
 * 🔴 @testing-library/jest-dom 7.0.1 は `interface Assertion<T>`（型引数1つ）で vitest を拡張するが、
 *    vitest 5 の Assertion は `<R, T>`（型引数2つ）。型引数の数が違うと宣言マージが成立せず、
 *    skipLibCheck で黙って捨てられて toBeInTheDocument 等が全滅する（2026-09-08 に 251 件）。
 *    ここで vitest 5 の形に合わせて同じマッチャを宣言し直す。
 *
 * jest-dom が vitest 5 対応版を出したら、このファイルを削除する。
 * 確認方法: node_modules/@testing-library/jest-dom/types/vitest.d.ts の Assertion の型引数が 2 つになっていること。
 */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import 'vitest'

declare module 'vitest' {
  // 型引数の名前と個数は vitest 5 本体（Assertion<R, T>）と一致させる必要がある。T は未使用だが省けない。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  interface Assertion<R, T> extends TestingLibraryMatchers<any, R> {}
}
