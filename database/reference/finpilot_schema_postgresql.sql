-- FinPilot MVP v2: PostgreSQL 15+ / ASP.NET Core Identity / EF Core 10 + Npgsql 10.
-- DESIGN BASELINE for a GREENFIELD database, NOT an upgrade of the previous file.
-- No DROP, CREATE DATABASE, credential seed, or production data migration is included.
-- Choose ONE deployment path: translate this baseline to EF migrations (preferred),
-- or apply this script once. Do not apply both to the same tables.
-- Prerequisite: Identity migrations have created public."AspNetUsers" with text "Id".
-- This is the default string Identity key contract. If the team chooses Guid keys or
-- a different schema, change ALL user FK types/targets in the migration before deployment.
-- Auth tables/password hashing/tokens are owned by Identity, not reimplemented here.
-- MVP: one owner, one shop; aggregate available VND cash; 9 business tables.
-- Naming: Shop=shops; Obligation=obligations; CashTransaction=cash_transactions.

BEGIN;
DO $$
BEGIN
    IF to_regclass('public."AspNetUsers"') IS NULL THEN
        RAISE EXCEPTION 'Run ASP.NET Core Identity migrations first (public.AspNetUsers, text Id).';
    END IF;
END $$;
CREATE SCHEMA finpilot;

CREATE TABLE finpilot.shops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id text NOT NULL UNIQUE REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT,
    name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
    currency char(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    time_zone varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    data_version bigint NOT NULL DEFAULT 0 CHECK (data_version >= 0),
    current_snapshot_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE finpilot.balance_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES finpilot.shops(id) ON DELETE RESTRICT,
    as_of_date date NOT NULL CHECK (isfinite(as_of_date)),
    revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    closing_amount numeric(18,0) NOT NULL CHECK (closing_amount >= 0 AND closing_amount <> 'NaN'::numeric),
    supersedes_id uuid,
    reason varchar(500) NOT NULL CHECK (length(btrim(reason)) > 0),
    created_by text NOT NULL REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, shop_id),
    UNIQUE (shop_id, as_of_date, revision),
    FOREIGN KEY (supersedes_id, shop_id) REFERENCES finpilot.balance_snapshots(id, shop_id) ON DELETE RESTRICT,
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);
ALTER TABLE finpilot.shops ADD CONSTRAINT shops_current_snapshot_fk
    FOREIGN KEY (current_snapshot_id, id) REFERENCES finpilot.balance_snapshots(id, shop_id) ON DELETE RESTRICT;
-- ClosingAmount = independently confirmed available cash at END of AsOfDate.
-- It is not an income transaction. Actual available cash cannot be negative in this MVP;
-- projected cash CAN go negative to indicate unmet obligations (not an overdraft facility).

CREATE TABLE finpilot.import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES finpilot.shops(id) ON DELETE RESTRICT,
    idempotency_key uuid NOT NULL,
    file_name varchar(255) NOT NULL,
    file_sha256 char(64) NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    template_version varchar(30) NOT NULL,
    status varchar(12) NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW','COMMITTED','DISCARDED')),
    created_by text NOT NULL REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    committed_at timestamptz,
    purge_after timestamptz,
    UNIQUE (id, shop_id),
    UNIQUE (shop_id, idempotency_key),
    CHECK ((status = 'COMMITTED') = (committed_at IS NOT NULL))
);
CREATE INDEX import_batches_hash_idx ON finpilot.import_batches(shop_id, file_sha256);
-- Hash is a duplicate WARNING, not proof two business events are identical.

CREATE TABLE finpilot.import_rows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES finpilot.shops(id) ON DELETE RESTRICT,
    batch_id uuid NOT NULL,
    row_no integer NOT NULL CHECK (row_no > 0),
    record_kind varchar(12) NOT NULL CHECK (record_kind IN ('OBLIGATION','ACTUAL')),
    raw_json jsonb,
    status varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VALID','ERROR','IMPORTED','SKIPPED')),
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, shop_id),
    UNIQUE (id, shop_id, record_kind),
    UNIQUE (batch_id, row_no),
    FOREIGN KEY (batch_id, shop_id) REFERENCES finpilot.import_batches(id, shop_id) ON DELETE RESTRICT,
    CHECK (raw_json IS NULL OR jsonb_typeof(raw_json) = 'object')
);

CREATE TABLE finpilot.obligations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES finpilot.shops(id) ON DELETE RESTRICT,
    direction varchar(3) NOT NULL CHECK (direction IN ('IN','OUT')),
    label varchar(200) NOT NULL CHECK (length(btrim(label)) > 0),
    category varchar(80),
    counterparty varchar(200),
    amount numeric(18,0) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
    due_date date NOT NULL CHECK (isfinite(due_date)),
    expected_date date CHECK (expected_date IS NULL OR isfinite(expected_date)),
    status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CANCELLED')),
    cancelled_at timestamptz,
    cancel_reason varchar(500),
    source_system varchar(80),
    external_ref varchar(200),
    source_import_row_id uuid UNIQUE,
    source_kind varchar(12) GENERATED ALWAYS AS ('OBLIGATION'::varchar) STORED,
    notes varchar(1000),
    created_by text NOT NULL REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, shop_id),
    UNIQUE (id, shop_id, direction),
    FOREIGN KEY (source_import_row_id, shop_id, source_kind)
        REFERENCES finpilot.import_rows(id, shop_id, record_kind) ON DELETE RESTRICT,
    CHECK ((status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL
            AND length(btrim(cancel_reason)) > 0)
        OR (status = 'OPEN' AND cancelled_at IS NULL AND cancel_reason IS NULL)),
    CHECK ((source_system IS NULL AND external_ref IS NULL)
        OR (source_system IS NOT NULL AND external_ref IS NOT NULL
            AND length(btrim(source_system)) > 0 AND length(btrim(external_ref)) > 0))
);
CREATE UNIQUE INDEX obligations_external_ref_idx
    ON finpilot.obligations(shop_id, source_system, direction, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX obligations_expected_idx
    ON finpilot.obligations(shop_id, (coalesce(expected_date, due_date))) WHERE status = 'OPEN';
-- SourceSystem identifies a namespace whose external references are genuinely unique.
-- Manual imports without such a guarantee leave source_system/external_ref null.

CREATE TABLE finpilot.cash_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES finpilot.shops(id) ON DELETE RESTRICT,
    idempotency_key uuid NOT NULL,
    direction varchar(3) NOT NULL CHECK (direction IN ('IN','OUT')),
    amount numeric(18,0) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
    tx_date date NOT NULL CHECK (isfinite(tx_date)),
    obligation_id uuid,
    ack_snapshot_id uuid,
    source_import_row_id uuid UNIQUE,
    source_kind varchar(12) GENERATED ALWAYS AS ('ACTUAL'::varchar) STORED,
    description varchar(1000),
    recorded_by text NOT NULL REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    voided_at timestamptz,
    voided_by text REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT,
    void_reason varchar(500),
    void_ack_snapshot_id uuid,
    UNIQUE (id, shop_id),
    UNIQUE (shop_id, idempotency_key),
    FOREIGN KEY (obligation_id, shop_id, direction)
        REFERENCES finpilot.obligations(id, shop_id, direction) ON DELETE RESTRICT,
    FOREIGN KEY (ack_snapshot_id, shop_id)
        REFERENCES finpilot.balance_snapshots(id, shop_id) ON DELETE RESTRICT,
    FOREIGN KEY (void_ack_snapshot_id, shop_id)
        REFERENCES finpilot.balance_snapshots(id, shop_id) ON DELETE RESTRICT,
    FOREIGN KEY (source_import_row_id, shop_id, source_kind)
        REFERENCES finpilot.import_rows(id, shop_id, record_kind) ON DELETE RESTRICT,
    CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL AND void_ack_snapshot_id IS NULL)
        OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL
            AND length(btrim(void_reason)) > 0))
);
CREATE INDEX cash_transactions_date_idx ON finpilot.cash_transactions(shop_id, tx_date) WHERE voided_at IS NULL;
CREATE INDEX cash_transactions_obligation_idx ON finpilot.cash_transactions(shop_id, obligation_id) WHERE voided_at IS NULL;
-- Immutable amounts/dates. VOID corrects an erroneous record; it is NOT a real refund.
-- Real refund = a new opposite-direction actual transaction, unallocated in MVP.
-- One actual transaction can settle at most one obligation. Batch payments must be
-- split into records; many-to-many PaymentAllocation is a post-MVP migration.

CREATE TABLE finpilot.scenarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES finpilot.shops(id) ON DELETE RESTRICT,
    name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
    base_snapshot_id uuid NOT NULL,
    base_data_version bigint NOT NULL CHECK (base_data_version >= 0),
    engine_version varchar(40) NOT NULL,
    input_schema_version integer NOT NULL CHECK (input_schema_version >= 1),
    forecast_start date NOT NULL CHECK (isfinite(forecast_start)),
    horizon_days integer NOT NULL DEFAULT 56 CHECK (horizon_days BETWEEN 1 AND 56),
    base_input_json jsonb NOT NULL CHECK (jsonb_typeof(base_input_json) = 'object'),
    adjustment_version bigint NOT NULL DEFAULT 0 CHECK (adjustment_version >= 0),
    result_cache_json jsonb CHECK (result_cache_json IS NULL OR jsonb_typeof(result_cache_json) = 'object'),
    parent_scenario_id uuid,
    created_by text NOT NULL REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, shop_id),
    FOREIGN KEY (base_snapshot_id, shop_id) REFERENCES finpilot.balance_snapshots(id, shop_id) ON DELETE RESTRICT,
    FOREIGN KEY (parent_scenario_id, shop_id) REFERENCES finpilot.scenarios(id, shop_id) ON DELETE RESTRICT,
    CHECK (parent_scenario_id IS NULL OR parent_scenario_id <> id)
);
CREATE INDEX scenarios_shop_idx ON finpilot.scenarios(shop_id, created_at DESC);

CREATE TABLE finpilot.scenario_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES finpilot.shops(id) ON DELETE RESTRICT,
    scenario_id uuid NOT NULL,
    type varchar(7) NOT NULL CHECK (type IN ('ADD','SHIFT','EXCLUDE')),
    target_event_id uuid,
    direction varchar(3) CHECK (direction IS NULL OR direction IN ('IN','OUT')),
    amount numeric(18,0) CHECK (amount IS NULL OR (amount > 0 AND amount <> 'NaN'::numeric)),
    event_date date CHECK (event_date IS NULL OR isfinite(event_date)),
    label varchar(200) NOT NULL CHECK (length(btrim(label)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, shop_id),
    FOREIGN KEY (scenario_id, shop_id) REFERENCES finpilot.scenarios(id, shop_id) ON DELETE RESTRICT,
    CHECK ((type = 'ADD' AND target_event_id IS NULL AND direction IS NOT NULL AND amount IS NOT NULL AND event_date IS NOT NULL)
        OR (type = 'SHIFT' AND target_event_id IS NOT NULL AND direction IS NULL AND amount IS NULL AND event_date IS NOT NULL)
        OR (type = 'EXCLUDE' AND target_event_id IS NOT NULL AND direction IS NULL AND amount IS NULL AND event_date IS NULL))
);
CREATE UNIQUE INDEX scenario_adjustments_target_idx
    ON finpilot.scenario_adjustments(scenario_id, target_event_id) WHERE target_event_id IS NOT NULL;
CREATE INDEX scenario_adjustments_shop_idx ON finpilot.scenario_adjustments(shop_id, scenario_id);
-- TargetEventId addresses a frozen PLANNED event inside base_input_json, NOT a live
-- obligation lookup and never a historical actual transaction. Validate membership in API.
-- ADD dates and SHIFT dates must be within the scenario period (validate in service).

CREATE TABLE finpilot.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES finpilot.shops(id) ON DELETE RESTRICT,
    actor_user_id text NOT NULL REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    entity_type varchar(80) NOT NULL,
    entity_id uuid NOT NULL,
    action varchar(80) NOT NULL,
    before_json jsonb,
    after_json jsonb,
    correlation_id uuid NOT NULL,
    UNIQUE (id, shop_id),
    CHECK (before_json IS NULL OR jsonb_typeof(before_json) = 'object'),
    CHECK (after_json IS NULL OR jsonb_typeof(after_json) = 'object')
);
CREATE INDEX audit_logs_shop_time_idx ON finpilot.audit_logs(shop_id, occurred_at DESC);
-- Audit entity_type/entity_id is intentional polymorphic history, not a navigable FK.
-- Never store credentials, cookies, tokens, raw import payloads or unnecessary PII here.

CREATE VIEW finpilot.obligation_balances AS
SELECT o.id, o.shop_id, o.direction, o.amount, o.status,
       coalesce(p.settled_amount, 0::numeric) AS settled_amount,
       CASE WHEN o.status = 'CANCELLED' THEN 0::numeric
            ELSE o.amount - coalesce(p.settled_amount, 0::numeric) END AS outstanding_amount
FROM finpilot.obligations o
LEFT JOIN (
    SELECT shop_id, obligation_id, sum(amount) AS settled_amount
    FROM finpilot.cash_transactions WHERE voided_at IS NULL AND obligation_id IS NOT NULL
    GROUP BY shop_id, obligation_id
) p ON p.shop_id = o.shop_id AND p.obligation_id = o.id;
-- This is CURRENT state, not a historical-as-of query. No duplicate paid status/total.
-- Negative outstanding is NOT clamped; it exposes a violated application invariant.

CREATE FUNCTION finpilot.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % forbidden', TG_TABLE_NAME, TG_OP;
END $$;
CREATE TRIGGER balance_snapshots_append_only BEFORE UPDATE OR DELETE ON finpilot.balance_snapshots
    FOR EACH ROW EXECUTE FUNCTION finpilot.reject_mutation();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON finpilot.audit_logs
    FOR EACH ROW EXECUTE FUNCTION finpilot.reject_mutation();
CREATE TRIGGER obligations_no_delete BEFORE DELETE ON finpilot.obligations
    FOR EACH ROW EXECUTE FUNCTION finpilot.reject_mutation();

CREATE FUNCTION finpilot.cash_transaction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Use VOID for an erroneous cash record, never DELETE'; END IF;
    IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'A voided cash record is immutable'; END IF;
    -- Do not read generated source_kind in a BEFORE trigger: it is computed later.
    IF ROW(NEW.id,NEW.shop_id,NEW.idempotency_key,NEW.direction,NEW.amount,NEW.tx_date,
           NEW.obligation_id,NEW.ack_snapshot_id,NEW.source_import_row_id,
           NEW.description,NEW.recorded_by,NEW.recorded_at)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.shop_id,OLD.idempotency_key,OLD.direction,OLD.amount,OLD.tx_date,
           OLD.obligation_id,OLD.ack_snapshot_id,OLD.source_import_row_id,
           OLD.description,OLD.recorded_by,OLD.recorded_at) THEN
        RAISE EXCEPTION 'Cash amount/date/link are immutable; void and enter a corrected record';
    END IF;
    IF NEW.voided_at IS NULL THEN RAISE EXCEPTION 'Only one-way VOID is allowed'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER cash_transaction_immutable BEFORE UPDATE OR DELETE ON finpilot.cash_transactions
    FOR EACH ROW EXECUTE FUNCTION finpilot.cash_transaction_guard();

CREATE FUNCTION finpilot.scenario_baseline_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.shop_id,NEW.base_snapshot_id,NEW.base_data_version,NEW.engine_version,
           NEW.input_schema_version,NEW.forecast_start,NEW.horizon_days,NEW.base_input_json,NEW.parent_scenario_id)
       IS DISTINCT FROM
       ROW(OLD.shop_id,OLD.base_snapshot_id,OLD.base_data_version,OLD.engine_version,
           OLD.input_schema_version,OLD.forecast_start,OLD.horizon_days,OLD.base_input_json,OLD.parent_scenario_id) THEN
        RAISE EXCEPTION 'Frozen baseline cannot change; create a child scenario for refresh';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER scenarios_frozen_baseline BEFORE UPDATE ON finpilot.scenarios
    FOR EACH ROW EXECUTE FUNCTION finpilot.scenario_baseline_guard();
COMMIT;

-- APPLICATION TRANSACTION CONTRACT (not automatically enforced by this DDL):
-- 1. Authenticate Identity user; authorize Shop.OwnerUserId for every read/write.
--    Never trust a client-supplied ShopId or actor ID. Composite FKs prevent invalid
--    links but DO NOT implement tenant authorization. RLS is not configured here.
-- 2. All real financial writes (obligation edits/cancel, actual/void, import commit,
--    snapshot/current pointer) acquire the same shop lock in a READ COMMITTED transaction:
--      SELECT id FROM finpilot.shops WHERE id=@authorizedShop FOR UPDATE;
--    THEN freshly read obligations + active actual sums; check total paid <= amount,
--    reject payment on cancelled obligations, and amount reduction below paid total.
--    Never rely on stale EF tracked entities, CHECK(sum(...)), or tests alone.
-- 3. Update data_version once, updated_at and an AuditLog in the same transaction.
--    Keep the lock short. User interaction/file parsing/LLM calls happen OUTSIDE it.
--    This serializes low-volume MVP writes per shop; review when adding collaborators.
-- 4. Actual TxDate must not be in the future relative to the shop's business date.
--    Reject fractional VND and NaN/Infinity in the API BEFORE numeric(18,0) can round.
--    Dates are DateOnly; audit timestamps UTC. JSON money values are strings.
-- 5. CurrentSnapshot.AsOfDate is end-of-day. Include actual movements AFTER that cutoff
--    through today, plus ONLY the unpaid portion of OPEN obligations after actuals.
--    For a forecast starting tomorrow, roll actuals into opening cash first. Unresolved
--    planned events before forecast_start must remain visibly unresolved: no auto-shift,
--    no double count and no 'safe to spend' conclusion from an incomplete schedule.
--    MVP does not replay historical forecasts from live data or guarantee intraday cash.
-- 6. Backdated actual/void at or before current cutoff requires explicit confirmation
--    that the confirmed snapshot already reflects the correct cash position, recorded
--    in ack_snapshot_id / void_ack_snapshot_id and audit. Otherwise reconcile the
--    amount and append a new snapshot revision before committing. Snapshot revision
--    chain must stay on the same as_of_date; don't move current cutoff backwards.
--    A new cutoff must be explicitly reconciled, not blindly calculated from stale data.
-- 7. Cancelling an obligation waives only its remaining plan; preserve past actuals.
--    No un-cancel in MVP. Direction/shop/source cannot be changed after settlement.
-- 8. Scenario capture uses a consistent read under the same shop lock. BaseInputJson
--    schema: snapshot {id,asOfDate,closingAmount}, openingCash, asOfBusinessDate,
--    events [{eventId,sourceObligationId?,direction,remainingAmount,expectedDate}],
--    unresolvedEvents and assumptions. Amounts are strings; stable UUID event IDs.
--    Validate the JSON schema, uniqueness, dates and source authorization at capture.
--    Compare baseline and modifications from the SAME frozen input/engine version.
--    BaseDataVersion != Shop.DataVersion => stale label. Explicit refresh creates a
--    new child baseline, validates/reapplies adjustments; never silently reuse targets.
--    Historical replay requires retaining the matching engine version; otherwise label
--    results saved/unsupported rather than recomputing with a different formula.
--    Adjustment writes lock the scenario, increment adjustment_version, invalidate
--    result_cache_json and audit; a cache must match base+adjustment+engine versions.
-- 9. Import commit locks shop AND batch, requires PREVIEW, verifies all rows, writes
--    all rows/records/status/audit atomically. A retry returns prior committed result.
--    Cross-file duplicates need warning/review or reliable scoped external IDs.
--    RawJson retention is explicitly chosen by team; purging never deletes target data.
-- 10. Runtime DB role: non-owner/non-superuser. Grant schema usage; limited table CRUD;
--     no DELETE/TRUNCATE on core cash/obligation/snapshot/audit tables. Only void columns
--     may be UPDATEd on cash_transactions. Snapshots/audit INSERT+SELECT only. Separate
--     migration role. The deployment grants and Identity permissions are NOT set here.
--     Triggers are defense in depth, not a substitute for app checks/role boundaries.

-- ACCEPTANCE CASES (relative days; not seed data; no credentials):
-- Snapshot 50m at day -1; OUT30 day0, OUT25 day7, IN35 day14 => 20m,-5m,30m.
-- EXCLUDE planned OUT30; ADD OUT20 day0 + OUT10 day15 => 30m,5m,40m,30m.
-- Shift IN35 to day16 => shortage5m day15. Actual 4m on obligation10m => remainder6m.
-- Snapshot after the 4m already includes it: do not subtract 4m twice.
-- Tests: cross-shop FKs, nullable CHECK branches, direction mismatch, duplicate commit,
-- concurrent overpayment, backdated void reconciliation, stale scenario refresh.

-- POST-MVP EXTENSION ROADMAP (NOT CREATED by this script):
-- Recommendation/ActionItem: link to versioned scenario/evidence; human accepts actions.
-- AIConversation/AIMessage/AIExecution: ShopId, authorized user, model/prompt versions,
-- input data version and engine result references. AI explains; C# computes; no direct
-- autonomous writes. Document/ExtractionResult stays pending until human validation.
-- ScoreDefinition/ScoreAssessment/ScoreComponent: versioned formulas and inputs.
-- Profitability needs reliable revenue/COGS/accrual inputs, not only cash movements.
-- Counterparty/Invoice/InvoiceLine/PaymentAllocation: migrate optional ObligationId
-- to allocations, reconcile each transaction once; never count invoice + obligation twice.
-- CashAccount/Transfer: backfill account assignment and split aggregate snapshots with
-- user reconciliation (historical split is unknowable); exclude internal transfers from
-- consolidated external cash flow. Do not merely add a nullable account column and assume parity.
-- Product/SKU/StockMovement/PurchaseOrder/SalesOrder: inventory receipt is not payment.
-- IntegrationConnection/SyncRun/ExternalRecord/ReconciliationMatch: reconcile imported
-- bank/POS events against manual cash records; encrypt tokens; no duplicate cash effects.
-- DetectionRule/Anomaly/AnomalyFeedback: evidence and model/rule versions.
-- BenchmarkDataset/Cohort/Metric: consent, aggregation, provenance and comparable periods.
-- ReportRun/ReportInputSnapshot/Loan/RepaymentSchedule: readiness, not loan approval.
-- ShopMember/Role/Permission/Branch: replace unique owner restriction only via reviewed
-- migration and broaden authorization tests. No extra tables until the feature is validated.
