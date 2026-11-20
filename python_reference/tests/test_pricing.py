import pytest
from src.pricing import (
    BookingConflictError,
    allocate_vehicles,
    build_safari_quote,
    persist_booking_transaction,
)


def test_residency_seasonal_and_per_day_park_fees(temp_db):
    high_q = build_safari_quote(
        circuit_query="Maasai Mara Classic",
        adults=2,
        children=1,
        infants_under_5=1,
        residency_tier="ea_citizen",
        start_date="2026-12-15",
        db_path=temp_db,
    )
    low_q = build_safari_quote(
        circuit_query="Maasai Mara Classic",
        adults=2,
        children=1,
        infants_under_5=1,
        residency_tier="ea_citizen",
        start_date="2026-05-15",
        db_path=temp_db,
    )
    assert high_q["season"] == "high"
    assert low_q["season"] == "low"
    assert high_q["breakdown_kes"]["conservation_fees"] == 19500.0
    assert low_q["breakdown_kes"]["conservation_fees"] == 9900.0
    assert high_q["breakdown_usd"]["accommodation"] == 725.0


def test_multi_vehicle_allocates_one_guide_per_vehicle(temp_db):
    q = build_safari_quote(
        circuit_query="Maasai Mara Classic",
        adults=10,
        start_date="2026-12-15",
        db_path=temp_db,
    )
    assert q["uncovered_pax"] == 0
    assert len(q["assigned_vehicles"]) == 2
    assert sum(v["assigned_pax"] for v in q["assigned_vehicles"]) == 10
    assert q["guides_required"] == 2
    assert len(q["assigned_guides"]) == 2
    assert q["guides_shortfall"] == 0


def test_seeded_overlap_excludes_lc01_and_peter_kamau(temp_db):
    q = build_safari_quote(
        circuit_query="Amboseli",
        adults=4,
        start_date="2026-12-11",
        db_path=temp_db,
    )
    assert "LC-01" not in q["vehicle_codes"]
    assert all(g["name"] != "Peter Kamau" for g in q["assigned_guides"])


def test_invalid_date_returns_error(temp_db):
    q = build_safari_quote(
        circuit_query="Amboseli",
        adults=2,
        start_date="2026-02-30",
        db_path=temp_db,
    )
    assert "error" in q


def test_allocate_vehicles_reports_uncovered_pax():
    fleet = [{"id": 1, "code": "LC-01", "max_pax": 6, "daily_rate_usd": 235, "tsv_licensed": 1}]
    assigned, uncovered = allocate_vehicles(fleet, 9)
    assert len(assigned) == 1
    assert uncovered == 3


def test_persist_booking_detects_race_conflict(temp_db):
    q1 = build_safari_quote("Lake Nakuru Flamingo & Rift", adults=2, start_date="2026-12-22", db_path=temp_db)
    q2 = build_safari_quote("Lake Nakuru Flamingo & Rift", adults=2, start_date="2026-12-22", db_path=temp_db)

    b1 = persist_booking_transaction("thr-race-1", q1, status="confirmed", db_path=temp_db)
    assert b1 is not None

    with pytest.raises(BookingConflictError):
        persist_booking_transaction("thr-race-2", q2, status="confirmed", db_path=temp_db)
