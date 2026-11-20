-- Safari Dispatch OS — PostgreSQL 16 Production Schema
-- Includes btree_gist exclusion constraints to prevent double-booking at the storage layer.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS circuits (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    park_or_reserve TEXT NOT NULL,
    authority_type TEXT NOT NULL CHECK (authority_type IN ('narok_reserve', 'kws_park', 'conservancy')),
    region TEXT NOT NULL,
    days INTEGER NOT NULL CHECK (days > 0),
    max_daily_drive_hours DOUBLE PRECISION NOT NULL CHECK (max_daily_drive_hours > 0),
    lodge_nightly_usd DOUBLE PRECISION NOT NULL CHECK (lodge_nightly_usd >= 0),
    high_ea_citizen_adult_kes DOUBLE PRECISION NOT NULL DEFAULT 0,
    high_ea_citizen_child_kes DOUBLE PRECISION NOT NULL DEFAULT 0,
    high_ke_resident_adult_kes DOUBLE PRECISION NOT NULL DEFAULT 0,
    high_ke_resident_child_kes DOUBLE PRECISION NOT NULL DEFAULT 0,
    high_af_citizen_adult_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    high_af_citizen_child_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    high_non_res_adult_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    high_non_res_child_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    low_ea_citizen_adult_kes DOUBLE PRECISION NOT NULL DEFAULT 0,
    low_ea_citizen_child_kes DOUBLE PRECISION NOT NULL DEFAULT 0,
    low_ke_resident_adult_kes DOUBLE PRECISION NOT NULL DEFAULT 0,
    low_ke_resident_child_kes DOUBLE PRECISION NOT NULL DEFAULT 0,
    low_af_citizen_adult_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    low_af_citizen_child_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    low_non_res_adult_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    low_non_res_child_usd DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fleet (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    vehicle_type TEXT NOT NULL,
    max_pax INTEGER NOT NULL CHECK (max_pax > 0),
    daily_rate_usd DOUBLE PRECISION NOT NULL CHECK (daily_rate_usd > 0),
    tsv_licensed INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'retired'))
);

CREATE TABLE IF NOT EXISTS guides (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    languages TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('senior', 'standard')),
    daily_rate_usd DOUBLE PRECISION NOT NULL CHECK (daily_rate_usd > 0),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_leave'))
);

CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    thread_id TEXT NOT NULL,
    customer_name TEXT,
    circuit_id INTEGER NOT NULL REFERENCES circuits(id),
    vehicle_codes_json TEXT NOT NULL,
    guide_id INTEGER REFERENCES guides(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    adults INTEGER NOT NULL CHECK (adults >= 0),
    children INTEGER NOT NULL CHECK (children >= 0),
    infants_under_5 INTEGER NOT NULL DEFAULT 0 CHECK (infants_under_5 >= 0),
    residency_tier TEXT NOT NULL,
    discount_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    quoted_total_usd DOUBLE PRECISION NOT NULL,
    quoted_total_kes DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('confirmed', 'held', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_allocations (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    vehicle_id INTEGER NOT NULL REFERENCES fleet(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    assigned_pax INTEGER NOT NULL CHECK (assigned_pax > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
    CONSTRAINT excl_vehicle_active_dates EXCLUDE USING gist (
        vehicle_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    ) WHERE (status = 'active')
);

CREATE TABLE IF NOT EXISTS booking_guides (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    guide_id INTEGER NOT NULL REFERENCES guides(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
    CONSTRAINT excl_guide_active_dates EXCLUDE USING gist (
        guide_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    ) WHERE (status = 'active')
);

CREATE TABLE IF NOT EXISTS pending_approvals (
    thread_id TEXT PRIMARY KEY,
    idempotency_key TEXT,
    user_message TEXT NOT NULL,
    slots_json TEXT NOT NULL,
    quote_json TEXT NOT NULL,
    critique_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'conflict')),
    reviewer TEXT,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS idempotency_records (
    idempotency_key TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    thread_id TEXT NOT NULL,
    node_name TEXT NOT NULL,
    decision TEXT NOT NULL,
    details_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
    thread_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    paused INTEGER NOT NULL DEFAULT 0,
    interrupt_json TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_allocations_dates ON vehicle_allocations (vehicle_id, start_date, end_date, status);
CREATE INDEX IF NOT EXISTS idx_pg_booking_guides_dates ON booking_guides (guide_id, start_date, end_date, status);
CREATE INDEX IF NOT EXISTS idx_pg_bookings_thread ON bookings (thread_id);
CREATE INDEX IF NOT EXISTS idx_pg_audit_thread ON audit_log (thread_id, id);
