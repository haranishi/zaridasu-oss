// Test-process guard: deny credential-file reads and non-loopback Node networking.
// workerd's own outbound traffic is separately denied by the Miniflare configuration.
import fs from 'node:fs'
import promises from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { syncBuiltinESMExports } from 'node:module'
import { fileURLToPath } from 'node:url'

export const observations = { credentialReads: 0, externalRequests: 0 }
function checkFile(input) {
  if (typeof input === 'number') return
  const filename = input instanceof URL ? fileURLToPath(input) : String(input)
  if (/(^|[/\\])(\.env(?:\.[^/\\]*)?|\.dev\.vars(?:\.[^/\\]*)?|credentials(?:\.json)?)([/\\]|$)/.test(filename)
    || /[/\\](\.turso|\.config[/\\]turso|\.wrangler[/\\]config)([/\\]|$)/.test(filename)) {
    observations.credentialReads++
    throw new Error('Credential-file reads are forbidden in the local DB trial')
  }
}
for (const [module, methods] of [[fs, ['readFile', 'readFileSync', 'open', 'openSync', 'createReadStream']],
  [promises, ['readFile', 'open']]]) {
  for (const name of methods) {
    const original = module[name]
    module[name] = function (filename, ...args) {
      checkFile(filename)
      return original.call(this, filename, ...args)
    }
  }
}
function checkHost(input, second) {
  let host
  if (input instanceof URL) host = input.hostname
  else if (typeof input === 'string') host = new URL(input).hostname
  else if (typeof input === 'number') host = typeof second === 'string' ? second : 'localhost'
  else host = input?.hostname ?? input?.host ?? 'localhost'
  if (!['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host)) {
    observations.externalRequests++
    throw new Error('External Node networking is forbidden in the local DB trial')
  }
}
for (const [module, methods] of [[http, ['request', 'get']], [https, ['request', 'get']],
  [net, ['connect', 'createConnection']], [tls, ['connect']]]) {
  for (const name of methods) {
    const original = module[name]
    module[name] = function (...args) {
      checkHost(args[0], args[1])
      return original.apply(this, args)
    }
  }
}
const fetch = globalThis.fetch
globalThis.fetch = async function (input, init) {
  checkHost(typeof input === 'string' || input instanceof URL ? input : input.url)
  return fetch(input, init)
}
syncBuiltinESMExports()
