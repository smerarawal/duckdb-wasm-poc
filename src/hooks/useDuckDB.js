import { useState, useEffect, useCallback } from 'react'
import { initDuckDB, getConnection } from '../lib/duckdb'
import { configureS3, loadParquetFromS3 } from '../lib/parquet'
import { STORAGE_TIERS } from '../lib/storageTier'

export function useDuckDB({ s3Tables = [] } = {}) {
  const [status, setStatus] = useState('idle')
  const [tier, setTier] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        setStatus('loading')

        const { tier: resolvedTier } = await initDuckDB()
        if (cancelled) return
        setTier(resolvedTier)

        await configureS3('ap-southeast-2')
        for (const { name, path, filters } of s3Tables) {
          await loadParquetFromS3(name, path, resolvedTier, filters)
        }

        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          console.error('[useDuckDB] bootstrap error', err)
          setError(err)
          setStatus('error')
        }
      }
    }

    bootstrap()
    return () => { cancelled = true }
  }, [])

  // query using the shared connection directly
  const query = useCallback(async (sql) => {
    const conn = getConnection()
    const result = await conn.query(sql)
    return result.toArray().map(r => r.toJSON())
  }, [])

  const tierLabel = {
    [STORAGE_TIERS.OPFS]:   'Tier 1 — OPFS (local SSD)',
    [STORAGE_TIERS.MEMORY]: 'Tier 2 — RAM (volatile)',
    [STORAGE_TIERS.STREAM]: 'Tier 3 — S3 stream',
  }[tier] ?? 'unknown'

  return { status, tier, tierLabel, error, query }
}
