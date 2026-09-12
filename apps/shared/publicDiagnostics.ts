type PublicHierarchyLayer = {
  getHierarchyDiagnostics(): {
    pageRequests: number;
    pageCacheHits: number;
    hierarchyBytesFetched?: number;
    loadedPageCount?: number;
    loadedEntryCount?: number;
  } | undefined;
};

/** Add only documented hierarchy counters to the renderer-neutral snapshot. */
export function withPublicHierarchyDiagnostics<T extends object>(
  snapshot: T,
  layer: PublicHierarchyLayer,
): T & { hierarchy?: Record<string, number> } {
  const diagnostics = layer.getHierarchyDiagnostics();
  if (!diagnostics) return snapshot;
  return {
    ...snapshot,
    hierarchy: {
      requestCount: diagnostics.pageRequests,
      cacheHitCount: diagnostics.pageCacheHits,
      // pageRequests is the number of network loads; cached lookups are
      // counted separately and may legitimately exceed network loads.
      cacheMissCount: diagnostics.pageRequests,
      ...(typeof diagnostics.hierarchyBytesFetched === 'number'
        ? { bytesFetched: diagnostics.hierarchyBytesFetched }
        : {}),
      ...(typeof diagnostics.loadedPageCount === 'number'
        ? { loadedPageCount: diagnostics.loadedPageCount }
        : {}),
      ...(typeof diagnostics.loadedEntryCount === 'number'
        ? { loadedEntryCount: diagnostics.loadedEntryCount }
        : {}),
    },
  };
}
