const MIN_ROWS = 80;
const REQUIRED = ['time', 'open', 'high', 'low', 'close'];

function finiteNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be finite`);
  return n;
}

export function normalizeUserSeries(records) {
  if (!Array.isArray(records)) throw new Error('BYOD records must be an array');
  if (records.length < MIN_ROWS) throw new Error(`BYOD analysis requires at least ${MIN_ROWS} observations`);

  const seen = new Set();
  const normalized = records.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Row ${index} must be an object`);
    const missing = REQUIRED.filter(key => !(key in row));
    if (missing.length) throw new Error(`Row ${index} is missing required fields: ${missing.join(', ')}`);

    const ms = Date.parse(row.time);
    if (!Number.isFinite(ms)) throw new Error(`Row ${index} has an invalid timestamp`);
    const time = new Date(ms).toISOString();
    if (seen.has(time)) throw new Error('BYOD data contains duplicate timestamps');
    seen.add(time);

    const open = finiteNumber(row.open, `Row ${index} open`);
    const high = finiteNumber(row.high, `Row ${index} high`);
    const low = finiteNumber(row.low, `Row ${index} low`);
    const close = finiteNumber(row.close, `Row ${index} close`);
    const volume = row.volume == null ? 0 : finiteNumber(row.volume, `Row ${index} volume`);

    if (high < Math.max(open, low, close) || low > Math.min(open, high, close)) {
      throw new Error(`Row ${index} has an invalid OHLC envelope`);
    }

    return { time, open, high, low, close, volume };
  });

  normalized.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return {
    sourceKind: 'user_supplied',
    records: normalized,
    validation: {
      rows: normalized.length,
      first: normalized[0].time,
      last: normalized.at(-1).time,
      serverProviderFetch: false,
    },
    rightsNotice: 'The user is responsible for rights to datasets they upload or connect.',
  };
}
