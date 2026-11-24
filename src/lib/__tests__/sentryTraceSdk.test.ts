// @vitest-environment node

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..')

describe('REQ-211 AC-04: installed Node SDK trace transport', () => {
  it('runs the transaction scrubber and exports useful spans without synthetic PII', () => {
    const output = execFileSync(process.execPath, [
      '--import', 'tsx', resolve(import.meta.dirname, 'fixtures/sentry-trace.fixture.mjs'),
    ], {
      cwd: PROJECT_ROOT,
      // Do not pass Sentry keys, Node preload options, or other host settings to the real SDK.
      env: { PATH: dirname(process.execPath), NODE_ENV: 'test', TZ: 'UTC', TSX_DISABLE_CACHE: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })

    expect(JSON.parse(output)).toEqual({
      closed: true,
      staticLifecycle: true,
      traceItemCount: 1,
      transactionCount: 1,
      childSpanCount: 1,
      hookInvocations: 1,
      payloadHasPii: false,
      rootScrubbed: true,
      childScrubbed: true,
      attributesScrubbed: true,
      usefulFieldsPreserved: true,
    })
  }, 25_000)
})
