export const E_PHASE14_TRACKING_DRIFT = 'E_PHASE14_TRACKING_DRIFT';

export class Phase14TrackingDriftError extends Error {
  constructor(reason, detail) {
    super(`${E_PHASE14_TRACKING_DRIFT}: ${reason}`);
    this.name = 'Phase14TrackingDriftError';
    this.code = E_PHASE14_TRACKING_DRIFT;
    this.reason = reason;
    this.detail = detail;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function surfaceKey(surface) {
  return surface?.featureId || surface?.path || '';
}

function rowKeys(row) {
  const keys = new Set();
  if (row?.featureId) keys.add(row.featureId);
  for (const item of asArray(row?.paths)) {
    keys.add(item);
  }
  return keys;
}

function hasMatchingRow(surface, rows) {
  const key = surfaceKey(surface);
  return rows.some((row) => rowKeys(row).has(key) || rowKeys(row).has(surface?.path));
}

function hasMatchingSurface(row, surfaces) {
  const keys = rowKeys(row);
  return surfaces.some((surface) => keys.has(surfaceKey(surface)) || keys.has(surface?.path));
}

function hasWikiUpdate(surface, wikiUpdates) {
  return wikiUpdates.includes(surface?.path) || wikiUpdates.includes(surface?.featureId);
}

export function evaluateTrackingDrift(descriptor = {}) {
  const changedSurfaces = asArray(descriptor.changedSurfaces);
  const featureLedgerRows = asArray(descriptor.featureLedgerRows);
  const liveSurfaces = asArray(descriptor.liveSurfaces);
  const wikiUpdates = asArray(descriptor.wikiUpdates);
  const statusLedgerUpdates = asArray(descriptor.statusLedgerUpdates);
  const advancedContracts = asArray(descriptor.advancedContracts);

  for (const surface of changedSurfaces) {
    if (surface?.kind === 'code' && !hasMatchingRow(surface, featureLedgerRows)) {
      throw new Phase14TrackingDriftError('surface-without-row', surface);
    }
  }

  for (const row of featureLedgerRows) {
    if (
      ['implemented', 'verified'].includes(row?.status) &&
      !hasMatchingSurface(row, liveSurfaces)
    ) {
      throw new Phase14TrackingDriftError('orphan-row', row);
    }
  }

  for (const surface of liveSurfaces) {
    if (!hasMatchingRow(surface, featureLedgerRows)) {
      throw new Phase14TrackingDriftError('missing-surface', surface);
    }
  }

  for (const surface of changedSurfaces) {
    if (surface?.kind === 'code' && !hasWikiUpdate(surface, wikiUpdates)) {
      throw new Phase14TrackingDriftError('surface-without-wiki', surface);
    }
  }

  for (const contract of advancedContracts) {
    if (!statusLedgerUpdates.includes(contract)) {
      throw new Phase14TrackingDriftError('stale-status', contract);
    }
  }

  return {
    ok: true,
    checked: {
      changedSurfaces: changedSurfaces.length,
      featureLedgerRows: featureLedgerRows.length,
      liveSurfaces: liveSurfaces.length,
      wikiUpdates: wikiUpdates.length,
      statusLedgerUpdates: statusLedgerUpdates.length,
      advancedContracts: advancedContracts.length,
    },
  };
}
