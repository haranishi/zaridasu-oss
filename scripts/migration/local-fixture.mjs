import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedFixture } from './fixtures.mjs'
import { openD1, openTurso } from './local-databases.mjs'

export { snapshotFixture } from './fixtures.mjs'
const STATE_ROOT = fileURLToPath(new URL('./.runtime/', import.meta.url))
const OWNER_FILE = '.fixture-owner'

function checkStatement(sql, parameters) {
  if (typeof sql !== 'string' || !sql.trim() || sql.length > 65536 || !Array.isArray(parameters)
    || parameters.length > 100 || parameters.some(value => value !== null && typeof value !== 'string'
      && (typeof value !== 'number' || !Number.isFinite(value)))) {
    throw new TypeError('Local fixture SQL requires a bounded statement and scalar bind parameters')
  }
}

/** A fresh, owned directory for one real LOCAL engine. Lifecycle calls are sequential. */
export async function createLocalFixture(engine, { seed = true } = {}) {
  if (typeof seed !== 'boolean') throw new TypeError('Boolean local fixture seed option required')
  if (engine !== 'turso' && engine !== 'd1') throw new TypeError('Choose local engine turso or d1')
  let directory, connection, destroyed = false
  const owner = randomUUID()
  const openDatabase = engine === 'turso' ? openTurso : openD1
  const ensureAlive = () => {
    if (destroyed) throw new Error('Local fixture is destroyed')
  }
  const ensureOpen = () => {
    ensureAlive()
    if (!connection) throw new Error('Local fixture is closed')
  }
  async function assertOwned() {
    const state = await lstat(directory)
    const marker = path.join(directory, OWNER_FILE)
    if (state.isSymbolicLink() || !state.isDirectory() || path.dirname(directory) !== path.resolve(STATE_ROOT)
      || await realpath(directory) !== directory || !(await lstat(marker)).isFile()
      || (await readFile(marker, 'utf8')) !== owner) throw new Error('Refusing a directory without fixture ownership')
  }
  async function allocate() {
    await mkdir(STATE_ROOT, { recursive: true })
    if ((await lstat(STATE_ROOT)).isSymbolicLink()) throw new Error('Fixture state root must not be a symlink')
    directory = await mkdtemp(path.join(STATE_ROOT, `${engine}-`))
    await writeFile(path.join(directory, OWNER_FILE), owner, { flag: 'wx', mode: 0o600 })
  }
  const fixture = {
    engine,
    get stateDirectory() { return directory },
    // Only for later engine-specific transaction trials; never exported to the app/browser.
    get database() { ensureOpen(); return connection.database },
    async query(sql, parameters = []) {
      ensureOpen()
      checkStatement(sql, parameters)
      return connection.query(sql, parameters)
    },
    async execute(sql, parameters = []) {
      ensureOpen()
      checkStatement(sql, parameters)
      return connection.execute(sql, parameters)
    },
    async close() {
      if (!connection) return
      await connection.close()
      connection = undefined
    },
    async reopen() {
      ensureAlive()
      if (connection) return
      await assertOwned()
      connection = await openDatabase(directory)
      await fixture.execute('PRAGMA foreign_keys = ON')
    },
    async reset() {
      ensureAlive()
      await fixture.close()
      await assertOwned()
      await rm(directory, { recursive: true })
      await allocate()
      await fixture.reopen()
      await seedFixture(fixture, { seed })
    },
    async destroy() {
      if (destroyed) return
      await fixture.close()
      await assertOwned()
      await rm(directory, { recursive: true })
      destroyed = true
    },
  }
  await allocate()
  try {
    await fixture.reopen()
    await seedFixture(fixture, { seed })
    return fixture
  } catch (error) {
    await fixture.destroy()
    throw error
  }
}
