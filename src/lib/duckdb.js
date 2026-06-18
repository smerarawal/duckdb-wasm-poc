/**
 * Phases 2, 3, 4 — DuckDB-WASM initialisation
 *
 * Bundle selection:
 *   eh.wasm  — multi-threaded (requires SharedArrayBuffer / COOP+COEP headers)
 *   mvp.wasm — single-threaded fallback (no COOP+COEP needed)
 *
 * DuckDB detects which bundle to use automatically via selectBundle().
 * If COOP/COEP headers are missing the browser blocks SharedArrayBuffer and
 * DuckDB gracefully downgrades to mvp.wasm.
 */

import * as duckdb from '@duckdb/duckdb-wasm'
import { resolveStorageTier, STORAGE_TIERS } from './storageTier'

let _db = null
let _conn = null
let _tier = null
let _initPromise = null

export async function initDuckDB() {
  // If already initialising, wait for that — don't create a second instance
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const bundles = duckdb.getJsDelivrBundles()
    const bundle = await duckdb.selectBundle(bundles)

    const worker = await duckdb.createWorker(bundle.mainWorker)
    const logger = new duckdb.ConsoleLogger()
    _db = new duckdb.AsyncDuckDB(logger, worker)
    await _db.instantiate(bundle.mainModule, bundle.pthreadWorker)

    const { tier, path } = await resolveStorageTier()
    _tier = tier

    await _db.open({ path: path ?? ':memory:' })

    _conn = await _db.connect()
    await _conn.query("INSTALL parquet; LOAD parquet; INSTALL httpfs; LOAD httpfs;")

    console.log(`[duckdb] initialised — bundle: ${bundle.mainModule}, tier: ${tier}`)
    return { db: _db, conn: _conn, tier }
  })()

  return _initPromise
}
export function getConnection() {
  if (!_conn) throw new Error('DuckDB not initialised — call initDuckDB() first')
  return _conn
}
