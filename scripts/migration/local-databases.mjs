import path from 'node:path'

// INTERNAL local test adapters. They never accept URLs, credentials or HTTP SQL requests.
export async function openTurso(directory) {
  const { connect } = await import('@tursodatabase/database')
  const database = await connect(path.join(directory, 'synthetic.db'), { timeout: 5000 })
  const statement = async (sql, parameters, method) => {
    const prepared = database.prepare(sql)
    try { return await prepared[method](...parameters) } finally { prepared.close() }
  }
  return {
    database,
    query: (sql, parameters) => statement(sql, parameters, 'all'),
    execute: (sql, parameters) => statement(sql, parameters, 'run'),
    close: () => database.close(),
  }
}

export async function openD1(directory) {
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare')
  const runtime = new Miniflare(convertV4MiniflareOptions({
    host: '127.0.0.1', port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: path.join(directory, 'storage'),
    isolatedResourcePersistencePath: path.join(directory, 'isolated-storage'),
    resourceTmpPath: path.join(directory, 'tmp'),
    name: 'synthetic-database-trial', compatibilityDate: '2026-11-14',
    modules: true,
    script: 'export default { fetch() { return new Response("Local database fixture", { status: 404 }); } }',
    d1Databases: { DB: '90000000-0000-4000-8000-000000000001' },
    outboundService() { throw new Error('External network is disabled for the local DB trial') },
  }))
  try {
    await runtime.ready
    const database = await runtime.getD1Database('DB')
    return {
      database,
      async query(sql, parameters) {
        const result = await database.prepare(sql).bind(...parameters).all()
        return result.results
      },
      execute: (sql, parameters) => database.prepare(sql).bind(...parameters).run(),
      close: () => runtime.dispose(),
    }
  } catch (error) {
    await runtime.dispose()
    throw error
  }
}
