import test from 'node:test';
import assert from 'node:assert/strict';
import { addForecastObservationTimes } from '../lib/market-time.mjs';

const forecast = {
  available: true,
  points: [
    { bar: 1, price: null, change: null },
    { bar: 3, price: null, change: null },
  ],
};

const candles = [
  { time: 1_000, close: 100 },
  { time: 1_300, close: 101 },
  { time: 1_600, close: 102 },
];

test('Coinbase forecast observations retain continuous-market timestamps', () => {
  const out = addForecastObservationTimes(forecast, candles, {}, 'coinbase', '5m');
  assert.equal(out.points[0].time, 1_900);
  assert.equal(out.points[1].time, 2_500);
  assert.equal(out.points[0].timeMode, 'continuous-market-estimate');
});

test('daily exchange forecasts never invent a business-day timestamp without an exchange calendar', () => {
  const daily = [
    { time: 1_700_000_000, close: 100 },
    { time: 1_700_086_400, close: 101 },
    { time: 1_700_172_800, close: 102 },
  ];
  const out = addForecastObservationTimes(forecast, daily, { marketState: 'CLOSED' }, 'yahoo', '1d');
  assert.ok(out.points.every(point => point.time === null));
  assert.ok(out.points.every(point => point.timeMode === 'exchange-calendar-required'));
  assert.match(out.timePolicy, /exchange calendar|observation/i);
});

test('Yahoo intraday timestamps are projected only while provably inside the current regular session', () => {
  const out = addForecastObservationTimes(
    forecast,
    candles,
    { marketState: 'REGULAR', regularSessionEnd: 2_000 },
    'yahoo',
    '5m',
  );
  assert.equal(out.points[0].time, 1_900);
  assert.equal(out.points[0].timeMode, 'regular-session-estimate');
  assert.equal(out.points[1].time, null);
  assert.equal(out.points[1].timeMode, 'exchange-calendar-required');
});

test('reference publication series expose observation offsets without fabricated future publication times', () => {
  for (const provider of ['amfi', 'ecb']) {
    const out = addForecastObservationTimes(forecast, candles, {}, provider, '1d');
    assert.ok(out.points.every(point => point.time === null));
    assert.ok(out.points.every(point => point.timeMode === 'publication-cadence'));
  }
});
