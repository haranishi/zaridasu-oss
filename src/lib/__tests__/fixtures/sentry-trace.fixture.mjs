// A separate Node process exercises the installed SDK, outside Vitest's module mocks.
import * as Sentry from '@sentry/nextjs'
import * as scrub from '../../sentryScrub.ts'

const email = 'fixture@example.invalid'
const ip = '192.0.2.123'
const token = 'synthetic-trace-token'
const items = []
let hookInvocations = 0

const client = Sentry.init({
  dsn: 'https://public@example.invalid/1',
  environment: 'test',
  defaultIntegrations: false,
  sendClientReports: false,
  // Sample every synthetic trace; application configs retain 0.1.
  tracesSampleRate: 1,
  dataCollection: scrub.SENTRY_DATA_COLLECTION,
  maxValueLength: 8192,
  // Before the fix this export is undefined, exercising the real SDK default.
  traceLifecycle: scrub.SENTRY_TRACE_LIFECYCLE,
  beforeSendTransaction(event) {
    hookInvocations += 1
    return scrub.scrubTransaction(event)
  },
  // No network transport is created, and the child environment contains no credentials.
  transport: () => ({
    send(envelope) {
      items.push(...envelope[1])
      return Promise.resolve({ statusCode: 200 })
    },
    flush: () => Promise.resolve(true),
  }),
})

await Sentry.startSpan({ name: `GET /fixture?email=${email}`, op: 'http.server', forceTransaction: true }, async () => {
  await Sentry.startSpan({
    name: `lookup ${email} from ${ip}`,
    op: 'db.query',
    attributes: {
      email,
      request_ip: ip,
      api_token: token,
      'http.url': `https://example.invalid/?token=${token}`,
      'fixture.operation': 'lookup',
    },
  }, async () => {
    await Promise.resolve()
  })
})

const closed = await Sentry.close(5000)
const traceItems = items.filter(([header]) => header.type === 'transaction' || header.type === 'span')
const transactions = traceItems.filter(([header]) => header.type === 'transaction').map(([, event]) => event)
const spans = transactions.flatMap(event => event.spans ?? [])
const payload = JSON.stringify(traceItems)
const child = spans.find(span => span.op === 'db.query')

// Only booleans and counts leave the fixture; raw envelopes never enter test logs.
console.log(JSON.stringify({
  closed,
  staticLifecycle: client?.getOptions().traceLifecycle === 'static',
  traceItemCount: traceItems.length,
  transactionCount: transactions.length,
  childSpanCount: spans.length,
  hookInvocations,
  payloadHasPii: [email, ip, token].some(value => payload.includes(value)),
  rootScrubbed: transactions[0]?.transaction === 'GET /fixture?email=[REDACTED]',
  childScrubbed: child?.description === 'lookup [REDACTED] from [REDACTED]',
  attributesScrubbed: child?.data?.email === '[REDACTED]' && child?.data?.request_ip === '[REDACTED]' && child?.data?.api_token === '[REDACTED]' && child?.data?.['http.url'] === 'https://example.invalid/?token=[REDACTED]',
  usefulFieldsPreserved: child?.data?.['fixture.operation'] === 'lookup' && child?.op === 'db.query' && Boolean(child?.span_id && child?.trace_id && child?.timestamp),
}))
