import { useState, useEffect } from 'react'
import { useDuckDB } from '../hooks/useDuckDB'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// Phase 1: declare which S3 Parquet tables to pull on startup.
// Files must be pre-sorted by dimensional keys (e.g. transaction_date)
// so DuckDB can exploit row-group MIN/MAX statistics for predicate pushdown.
const S3_TABLES = [
  {
    name: 'transactions',
    path: 'transactions.parquet',
    filters: {},
  },
]

export default function Dashboard() {
  const { status, tierLabel, error, query } = useDuckDB({ s3Tables: S3_TABLES })
  const [chartData, setChartData] = useState([])
  const [region, setRegion] = useState('ALL')
  const [queryMs, setQueryMs] = useState(null)

  // Re-query whenever the region filter changes (Phase 5: Arrow → rows)
  useEffect(() => {
    if (status !== 'ready') return

    async function runQuery() {
      const where = region !== 'ALL' ? `WHERE region = '${region}'` : ''
      const t0 = performance.now()

      // Phase 5: results flow from DuckDB WASM → Arrow IPC → JS rows
      const rows = await query(`
        SELECT
          strftime(transaction_date::DATE, '%Y-%m') AS month,
          SUM(amount)                               AS revenue,
          COUNT(*)                                  AS txn_count
        FROM transactions
      ${where}
      GROUP BY month
      ORDER BY month
`)

      setQueryMs(Math.round(performance.now() - t0))
      setChartData(rows)
    }

    runQuery()
  }, [status, region, query])

  if (status === 'error') {
    return (
      <div style={{ padding: '2rem', color: 'var(--color-text-danger)' }}>
        DuckDB init failed: {error?.message}
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'var(--font-sans)' }}>

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.25rem' }}>
          Analytics dashboard
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          Storage: <strong>{tierLabel}</strong>
          {queryMs !== null && <span> · Last query: {queryMs}ms</span>}
          {status === 'loading' && <span> · Initialising DuckDB…</span>}
        </p>
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '8px' }}>
        {['ALL', 'APAC', 'EMEA', 'AMER'].map(r => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '0.5px solid var(--color-border-secondary)',
              background: region === r ? 'var(--color-background-info)' : 'transparent',
              color: region === r ? 'var(--color-text-info)' : 'var(--color-text-primary)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {status === 'ready' && chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#378ADD"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{
          height: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: '14px',
          border: '0.5px dashed var(--color-border-tertiary)',
          borderRadius: '8px',
        }}>
          {status === 'loading' ? 'Loading data from S3…' : 'No data'}
        </div>
      )}
    </div>
  )
}
