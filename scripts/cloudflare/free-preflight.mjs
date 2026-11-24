import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { collectFreeAccount } from './free-preflight-account.mjs'
import { inspectFreeCandidate, readPrivateJson } from './free-preflight-artifacts.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const FREE_PRODUCTS = ['workers', 'assets', 'd1', 'durableObjects', 'images']
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const validId = value => /^[a-f0-9]{32}$/.test(value ?? '')
const fresh = (value, now) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && Date.parse(value) <= now && now - Date.parse(value) <= MAX_AGE_MS

/** Readiness for a bounded experiment only; this module never mutates a remote service. */
export function evaluateFreePreflight({ selection = {}, account = {}, candidate = {}, budget = {} } = {}, now = Date.now()) {
  const reasons = []
  if (!validId(selection.accountId) || selection.accountId !== selection.expectedAccountId
    || account.accountId !== selection.accountId || account.accountMatch !== true
    || candidate.accountId !== selection.accountId) reasons.push('ACCOUNT_MISMATCH')
  const names = ['workerName', 'rendererName', 'backendName'].map(key => selection[key])
  if (names.some(name => typeof name !== 'string' || name.length > 63 || !/^zaridasu-[a-z0-9-]+-preview(?:-[a-z0-9-]+)?$/.test(name))
    || new Set(names).size !== 3 || selection.databaseName !== `${selection.workerName}-cache`
    || (candidate.verified === true && ['workerName', 'rendererName', 'backendName', 'databaseName'].some(key => candidate.resourceNames?.[key] !== selection[key]))) reasons.push('RESOURCE_IDENTITY_MISMATCH')
  if (!fresh(account.checkedAt, now)) reasons.push('ACCOUNT_EVIDENCE_STALE')
  if (account.acceptedAdmin !== true) reasons.push('ROLE_UNVERIFIED')
  if (account.names?.workersComplete !== true || account.names?.databasesComplete !== true) reasons.push('RESOURCE_NAMES_UNVERIFIED')
  if (account.names?.collisions !== 0) reasons.push('RESOURCE_NAME_COLLISION')
  const planStatus = {}
  for (const product of FREE_PRODUCTS) {
    const proof = account.plans?.[product]
    planStatus[product] = ['free', 'paid'].includes(proof?.status) ? proof.status : 'unknown'
    if (proof?.status !== 'free') { reasons.push(`PLAN_${product.toUpperCase()}_${proof?.status === 'paid' ? 'PAID' : 'UNKNOWN'}`); continue }
    if (proof.accountId !== selection.accountId || !fresh(proof.checkedAt, now)) reasons.push(`PLAN_${product.toUpperCase()}_EVIDENCE_INVALID`)
    if (product === 'workers' || product === 'images') {
      const title = product === 'workers' ? 'Workers Free' : 'Images Free'
      if (proof.source !== 'api-subscriptions' || proof.publicName !== title || proof.scope !== 'account'
        || proof.state !== 'Provisioned' || proof.price !== 0 || typeof proof.evidenceId !== 'string' || !proof.evidenceId
        || !(Date.parse(proof.periodStart) <= now && Date.parse(proof.periodEnd) > now)) {
        reasons.push(`PLAN_${product.toUpperCase()}_PROVENANCE_INVALID`)
      }
    } else if (proof.source !== 'inherits-workers' || proof.from !== 'workers'
      || account.plans?.workers?.status !== 'free' || proof.checkedAt !== account.plans.workers.checkedAt) {
      reasons.push(`PLAN_${product.toUpperCase()}_PROVENANCE_INVALID`)
    }
  }
  if (candidate.verified !== true || !/^[a-f0-9]{64}$/.test(candidate.sourceArtifactDigest ?? '')) reasons.push('CANDIDATE_UNVERIFIED')
  if (candidate.quarantined === true) reasons.push('ARTIFACT_QUARANTINED')
  if (candidate.unsupportedBindings?.length || (candidate.verified === true && (candidate.products?.length !== FREE_PRODUCTS.length
    || !FREE_PRODUCTS.every(product => candidate.products?.includes(product))))) reasons.push('UNSUPPORTED_BINDING')
  if (selection.mode !== 'isolated-preview' || selection.localDatabaseIdOnly !== false || candidate.localOnly !== false
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(selection.databaseId ?? '') || /^00000000-/.test(selection.databaseId)) reasons.push('LOCAL_ONLY_PROFILE')
  if (!Number.isInteger(budget.requests) || budget.requests < 1 || budget.requests > 250
    || !Number.isInteger(budget.bytes) || budget.bytes < 1 || budget.bytes > 100_000_000) reasons.push('EXPERIMENT_BUDGET_INVALID')
  if (Array.isArray(candidate.reasons)) reasons.push(...candidate.reasons)
  return { eligibleForBoundedPreview: reasons.length === 0, remoteMutationAllowed: false,
    productionEligible: false, planStatus, reasons: [...new Set(reasons)] }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Unsupported tooling')
    const [command, settingsFile, ...extra] = process.argv.slice(2)
    if (!['inspect', 'refresh'].includes(command) || !settingsFile || extra.length) throw new Error('Invalid arguments')
    const settings = await readPrivateJson(settingsFile)
    const selection = await readPrivateJson(settings.selectionFile)
    const [candidate, account] = await Promise.all([
      inspectFreeCandidate({ ...settings, selection }),
      command === 'refresh' ? collectFreeAccount(selection) : readPrivateJson(settings.accountFile).then(value => value.account ?? value),
    ])
    const decision = evaluateFreePreflight({ selection, account, candidate,
      budget: settings.budget ?? { requests: 250, bytes: 100_000_000 } })
    const directory = path.join(ROOT, '.wrangler/task-7.3')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const name = `preflight-${Date.now()}-${randomBytes(4).toString('hex')}.json`
    await writeFile(path.join(directory, name), JSON.stringify({ checkedAt: new Date().toISOString(),
      account, candidate, decision, remoteMutations: 0, billingChanges: 0 }, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    console.log(JSON.stringify({ ...decision, report: `.wrangler/task-7.3/${name}` }))
    process.exitCode = decision.eligibleForBoundedPreview ? 0 : 1
  } catch {
    console.log(JSON.stringify({ eligibleForBoundedPreview: false, remoteMutationAllowed: false,
      productionEligible: false, reasons: ['PREFLIGHT_INPUT_OR_TOOLING_INVALID'] }))
    process.exitCode = 2
  }
}
