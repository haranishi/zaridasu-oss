import '@testing-library/jest-dom'
import { expect, vi } from 'vitest'
import * as React from 'react'
import * as matchers from 'vitest-axe/matchers'
import { webcrypto } from 'node:crypto'
expect.extend(matchers)

// CI（jsdom + Node の組み合わせ）では globalThis.crypto に subtle が無く、sha256Hex
// （crypto.subtle.digest）が null を返してハッシュ系テストが落ちることがある。
// node:crypto の webcrypto で crypto.subtle を保証する（ローカルは既に存在＝実質 no-op）。
if (!globalThis.crypto || !('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
}

globalThis.React = React as any

// jsdom 依存のモックは jsdom 環境でのみ適用する。REQ-267: 一部テスト（sha256 等 DOM 非依存）は
// `// @vitest-environment node` で node 環境で動かすため、その場合 window は存在しない。
if (typeof window !== 'undefined') {
  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Mock ResizeObserver
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver
}

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      pathname: '/',
    };
  },
  usePathname() {
    return '';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));
