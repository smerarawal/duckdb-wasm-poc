export const STORAGE_TIERS = {
  OPFS: 'opfs',
  MEMORY: 'memory',
  STREAM: 'stream',
}

export async function resolveStorageTier() {
  console.log('[storage] Tier 2 — in-memory (:memory:)')
  return { tier: STORAGE_TIERS.MEMORY, path: ':memory:' }
}
