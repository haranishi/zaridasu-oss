// This side effect must run before OpenNext/Sentry capture global fetch.
import { env } from 'cloudflare:workers'
import { previewFetch } from './security.mjs'

globalThis.fetch = (input, init) => previewFetch(input, init, env)
