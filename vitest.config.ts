import { defineConfig } from 'vitest/config'
import path from 'path'

const IGNORED = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.open-next/**', '**/.wrangler/**', 'tests/e2e/**', 'supabase/functions/**']

/**
 * 🔴 pool: 'vmThreads' で動かせない唯一のファイル。
 *
 * vmThreads では `window.location` が configurable:false / writable:false で固定され、
 * `Object.defineProperty` も `vi.stubGlobal` も `vi.spyOn(location, 'reload')` も
 * すべて "Cannot redefine property" で拒否される（2026-09-08 実測。回避策なし）。
 * このファイルは location.reload を差し替えて「無限リロードしない」ことを見ているので、
 * ここだけ既定のプール（forks）で走らせる。
 *
 * 増やさないこと。増えるようならプール分割自体をやめて、素直に既定へ戻す。
 */
const NEEDS_REAL_LOCATION = ['src/app/__tests__/error.test.tsx']

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: IGNORED,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // REQ-297: 旧値 65/50/50/70 は CI で一度も強制されず、実測未達の飾りだった。
      // 2026-07-31 実測 61.02/48.15/52.08/64.19% の約1pt下を実効ゲートにする。
      // 旧値は REQ-311 のテスト追加で回収する目標値とし、以後この閾値は下げない。
      thresholds: {
        statements: 60,
        branches: 47,
        functions: 51,
        lines: 63,
      },
    },
    /**
     * jsdom の生成がテスト時間の約6割を占めていた（97ファイルで97回作り直していた）。
     * vmThreads はファイル単位の隔離を保ったまま環境を使い回す。
     * 2026-09-08 実測: 13.3〜14.4秒 → 4.5〜4.8秒。
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          pool: 'vmThreads',
          exclude: [...IGNORED, ...NEEDS_REAL_LOCATION],
        },
      },
      {
        extends: true,
        test: {
          name: 'real-location',
          include: NEEDS_REAL_LOCATION,
          exclude: IGNORED,
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
