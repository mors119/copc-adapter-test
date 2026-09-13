export function benchmarkCacheOptions(): { maxPointCacheBytes?: number } {
  if (typeof window === 'undefined') return {};
  const value = Number(new URLSearchParams(window.location.search).get('benchmarkCacheBudgetBytes'));
  return Number.isSafeInteger(value) && value > 0 ? { maxPointCacheBytes: value } : {};
}
