import { getConnection } from './duckdb'
import { STORAGE_TIERS } from './storageTier'

const S3_BASE = 'https://duckdb-poc-bucket.s3.ap-southeast-2.amazonaws.com'

export async function configureS3(region = 'ap-southeast-2') {
  const conn = getConnection()
  await conn.query(`
    SET s3_region='${region}';
    SET s3_access_key_id='${import.meta.env.VITE_AWS_ACCESS_KEY}';
    SET s3_secret_access_key='${import.meta.env.VITE_AWS_SECRET_KEY}';
  `)
}

export async function loadParquetFromS3(tableName, s3Path, tier, filters = {}) {
  const conn = getConnection()
  const fullPath = `${S3_BASE}/${s3Path}`

  const predicates = Object.entries(filters)
    .map(([col, val]) => `${col} = ${typeof val === 'string' ? `'${val}'` : val}`)
    .join(' AND ')
  const whereClause = predicates ? `WHERE ${predicates}` : ''

  if (tier === STORAGE_TIERS.STREAM) {
    await conn.query(`
      CREATE OR REPLACE VIEW ${tableName} AS
      SELECT * FROM read_parquet('${fullPath}', hive_partitioning=true)
      ${whereClause};
    `)
    console.log(`[parquet] VIEW created over ${fullPath} (streaming mode)`)
  } else {
    await conn.query(`
      CREATE OR REPLACE TABLE ${tableName} AS
      SELECT * FROM read_parquet('${fullPath}', hive_partitioning=true)
      ${whereClause};
    `)
    console.log(`[parquet] TABLE materialised from ${fullPath}`)

     }
}

export async function query(sql) {
  const conn = getConnection()
  const result = await conn.query(sql)
  return result.toArray().map(r => r.toJSON())
}
