-- Independent source observations only. As-issued fields are immutable.
CREATE TABLE IF NOT EXISTS predictions (
 id TEXT PRIMARY KEY NOT NULL,
 provider TEXT NOT NULL CHECK(provider='coinbase'),
 symbol TEXT NOT NULL CHECK(symbol IN ('BTC-USD','ETH-USD')),
 interval TEXT NOT NULL CHECK(interval='5m'),
 model_version TEXT NOT NULL,
 origin_time INTEGER NOT NULL,
 expected_time INTEGER NOT NULL,
 issued_at INTEGER NOT NULL,
 source_json TEXT NOT NULL,
 raw_json TEXT NOT NULL,
 baseline_json TEXT NOT NULL,
 predicted_json TEXT NOT NULL,
 parameters_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PENDING','SETTLED','UNOBSERVED_GAP')),
 observed_json TEXT,
 settled_at INTEGER,
 CHECK(expected_time=origin_time+300),
 CHECK((state='PENDING' AND observed_json IS NULL) OR (state='SETTLED' AND observed_json IS NOT NULL) OR (state='UNOBSERVED_GAP' AND observed_json IS NULL)),
 UNIQUE(provider,symbol,interval,origin_time,model_version)
);
CREATE INDEX IF NOT EXISTS idx_predictions_symbol_time ON predictions(symbol,origin_time DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_symbol_state ON predictions(symbol,interval,state,origin_time DESC);
CREATE TRIGGER IF NOT EXISTS prediction_immutable
BEFORE UPDATE OF id,provider,symbol,interval,model_version,
 origin_time,expected_time,issued_at,source_json,raw_json,
 baseline_json,predicted_json,parameters_json
ON predictions
BEGIN
 SELECT RAISE(ABORT,'Original as-issued forecast cannot be edited');
END;
CREATE TABLE IF NOT EXISTS run_slots (
 slot INTEGER PRIMARY KEY,
 started_at INTEGER NOT NULL,
 finished_at INTEGER,
 issued INTEGER NOT NULL DEFAULT 0,
 settled INTEGER NOT NULL DEFAULT 0,
 gaps INTEGER NOT NULL DEFAULT 0,
 failures_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_runs_recent ON run_slots(slot DESC);
