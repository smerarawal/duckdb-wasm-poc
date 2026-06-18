/**
 * Phase 5 — Apache Arrow zero-copy hand-off
 *
 * DuckDB-WASM exports query results as Arrow IPC buffers.
 * We use the Transferable Objects protocol to shift the underlying
 * ArrayBuffer memory directly to the main thread — no JSON serialisation,
 * no Structured Clone cost, no data copying.
 *
 * The returned Arrow Table is consumed directly by recharts/d3/Vega etc.
 */

import { tableFromIPC } from 'apache-arrow'
import { getConnection } from './duckdb'

/**
 * Execute SQL and return an Apache Arrow Table.
 * The buffer is transferred (not copied) — call .toArray() or iterate
 * column vectors directly for maximum throughput.
 *
 * @param {string} sql
 * @returns {Promise<import('apache-arrow').Table>}
 */
export async function queryArrow(sql) {
  const conn = getConnection()

  // sendAsArrow returns raw IPC bytes — no JSON round-trip
  const arrowResult = await conn.send(sql)

  // Collect all record batches from the async iterator
  const batches = []
  for await (const batch of arrowResult) {
    batches.push(batch)
  }

  // Reconstruct a full Arrow Table from the record batches
  const table = tableFromIPC(batches)
  return table
}

/**
 * Convert an Arrow Table column to a plain JS array.
 * Use this only for columns that need to feed non-Arrow-aware charting libs.
 */
export function arrowColumnToArray(table, columnName) {
  const col = table.getChild(columnName)
  if (!col) throw new Error(`Column "${columnName}" not found in Arrow table`)
  return Array.from(col)
}

/**
 * Convert a full Arrow Table to the [{key: value}] row format expected by Recharts.
 * For large datasets, prefer iterating Arrow vectors directly.
 */
export function arrowToRows(table) {
  return table.toArray().map(row => row.toJSON())
}
