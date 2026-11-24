import 'vitest'
import type { AxeResults } from 'axe-core'

declare module 'vitest' {
  interface Assertion<T> {
    toHaveNoViolations(): T extends Promise<AxeResults> ? Promise<T> : T
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): unknown
  }
}
