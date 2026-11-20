import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from src.db import read_conn, write_tx


class BookingConflictError(Exception):
    """Raised when a vehicle or guide became unavailable before confirmation."""


def get_usd_to_kes() -> float:
    try:
        return float(os.getenv("USD_TO_KES_RATE", "129.5"))
    except ValueError:
        return 129.5


def validate_iso_date(date_str: str) -> date:
    return date.fromisoformat(date_str.strip())


def is_high_season(start_date_obj: date, authority_type: str) -> bool:
    if authority_type == "narok_reserve":
        return start_date_obj.month >= 7
    return start_date_obj.month in {7, 8, 9, 10, 12, 1, 2}


def compute_end_date(start_date_obj: date, days: int) -> str:
    return (start_date_obj + timedelta(days=max(days - 1, 0))).isoformat()


def allocate_vehicles(available_vehicles: list[dict[str, Any]], total_pax: int) -> tuple[list[dict[str, Any]], int]:
    """Greedily allocate available TSV-licensed vehicles to cover total_pax."""
    remaining = max(int(total_pax), 0)
    if remaining == 0:
        return [], 0

    pool = sorted(
        [dict(v) for v in available_vehicles if int(v.get("tsv_licensed", 1)) == 1],
        key=lambda v: (-int(v["max_pax"]), float(v["daily_rate_usd"])),
    )
    assigned: list[dict[str, Any]] = []

    for v in pool:
        if remaining <= 0:
            break
        cap = int(v["max_pax"])
        take = min(cap, remaining)
        v_copy = dict(v)
        v_copy["assigned_pax"] = take
        assigned.append(v_copy)
        remaining -= take

    return assigned, remaining


def build_safari_quote(
    circuit_query: str,
    adults: int,
    children: int = 0,
    infants_under_5: int = 0,
    residency_tier: str = "non_resident",
    start_date: str = "2026-12-15",
    prefer_senior_guide: bool = False,
    discount_pct: float = 0.0,
    db_path: Path | None = None,
) -> dict[str, Any]:
    fx = get_usd_to_kes()
    try:
        start_obj = validate_iso_date(start_date)
    except ValueError:
        return {"error": f"Invalid start_date '{start_date}'. Expected valid ISO YYYY-MM-DD date."}

    adults_i = max(int(adults), 0)
    children_i = max(int(children), 0)
    infants_i = max(int(infants_under_5), 0)
    total_pax = adults_i + children_i + infants_i
    if total_pax <= 0:
        return {"error": "Guest count must be at least 1."}

    with read_conn(db_path) as conn:
        q = circuit_query.strip()
        circuit_row = conn.execute(
            """
            SELECT * FROM circuits
            WHERE LOWER(name) = LOWER(?)
               OR LOWER(code) = LOWER(?)
               OR LOWER(name) LIKE LOWER(?)
               OR LOWER(park_or_reserve) LIKE LOWER(?)
            ORDER BY
                CASE
                    WHEN LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) THEN 0
                    WHEN LOWER(name) LIKE LOWER(?) THEN 1
                    ELSE 2
                END,
                id ASC
            LIMIT 1
            """,
            (q, q, f"%{q}%", f"%{q}%", q, q, f"%{q}%"),
        ).fetchone()

        if not circuit_row:
            names = [r["name"] for r in conn.execute("SELECT name FROM circuits ORDER BY id").fetchall()]
            return {
                "error": f"Unknown circuit '{circuit_query}'. Available circuits: {', '.join(names)}",
                "available_circuits": names,
            }

        circuit = dict(circuit_row)
        days = int(circuit["days"])
        nights = max(days - 1, 0)
        end_date = compute_end_date(start_obj, days)
        high_season = is_high_season(start_obj, circuit["authority_type"])
        season_label = "high" if high_season else "low"

        free_vehicles = [
            dict(r)
            for r in conn.execute(
                """
                SELECT f.*
                FROM fleet f
                WHERE f.status = 'available'
                  AND f.tsv_licensed = 1
                  AND f.id NOT IN (
                      SELECT va.vehicle_id
                      FROM vehicle_allocations va
                      WHERE va.status = 'active'
                        AND NOT (va.end_date < ? OR va.start_date > ?)
                  )
                """,
                (start_date, end_date),
            ).fetchall()
        ]

        assigned_vehicles, uncovered_pax = allocate_vehicles(free_vehicles, total_pax)
        guides_required = max(len(assigned_vehicles), 1) if total_pax > 0 else 0

        guide_filter = "AND g.tier = 'senior'" if prefer_senior_guide else ""
        free_guides = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT g.*
                FROM guides g
                WHERE g.status = 'available'
                  {guide_filter}
                  AND g.id NOT IN (
                      SELECT bg.guide_id
                      FROM booking_guides bg
                      JOIN bookings b ON b.id = bg.booking_id
                      WHERE bg.status = 'active'
                        AND b.status = 'confirmed'
                        AND NOT (bg.end_date < ? OR bg.start_date > ?)
                  )
                ORDER BY CASE WHEN g.tier = 'senior' THEN 0 ELSE 1 END, g.daily_rate_usd ASC
                LIMIT ?
                """,
                (start_date, end_date, guides_required),
            ).fetchall()
        ]

    guides_shortfall = max(guides_required - len(free_guides), 0)
    lead_guide = free_guides[0] if free_guides else None

    prefix = "high" if high_season else "low"
    if residency_tier in {"ea_citizen", "ke_resident"}:
        adult_kes = float(circuit[f"{prefix}_{residency_tier}_adult_kes"])
        child_kes = float(circuit[f"{prefix}_{residency_tier}_child_kes"])
        park_fees_kes = ((adults_i * adult_kes) + (children_i * child_kes)) * days
        park_fees_usd = round(park_fees_kes / fx, 2)
    else:
        tier_key = "af_citizen" if residency_tier == "af_citizen" else "non_res"
        adult_usd = float(circuit[f"{prefix}_{tier_key}_adult_usd"])
        child_usd = float(circuit[f"{prefix}_{tier_key}_child_usd"])
        park_fees_usd = round(((adults_i * adult_usd) + (children_i * child_usd)) * days, 2)
        park_fees_kes = round(park_fees_usd * fx, 2)

    vehicle_total_usd = round(sum(float(v["daily_rate_usd"]) * days for v in assigned_vehicles), 2)
    guide_total_usd = round(sum(float(g["daily_rate_usd"]) * days for g in free_guides), 2)
    lodge_pax_equivalent = adults_i + (0.5 * children_i)
    lodge_total_usd = round(float(circuit["lodge_nightly_usd"]) * nights * lodge_pax_equivalent, 2)

    gross_total_usd = round(vehicle_total_usd + guide_total_usd + lodge_total_usd + park_fees_usd, 2)
    net_total_usd = round(gross_total_usd * (1.0 - float(discount_pct) / 100.0), 2)
    net_total_kes = round(net_total_usd * fx, 2)

    return {
        "circuit": circuit,
        "season": season_label,
        "start_date": start_date,
        "end_date": end_date,
        "days": days,
        "nights": nights,
        "adults": adults_i,
        "children": children_i,
        "infants_under_5": infants_i,
        "total_pax": total_pax,
        "residency_tier": residency_tier,
        "assigned_vehicles": assigned_vehicles,
        "vehicle_codes": [v["code"] for v in assigned_vehicles],
        "uncovered_pax": uncovered_pax,
        "assigned_guides": free_guides,
        "guide": lead_guide,
        "guides_required": guides_required,
        "guides_shortfall": guides_shortfall,
        "discount_pct": float(discount_pct),
        "fx_usd_to_kes": fx,
        "breakdown_usd": {
            "vehicles": vehicle_total_usd,
            "guide": guide_total_usd,
            "accommodation": lodge_total_usd,
            "conservation_fees": park_fees_usd,
        },
        "breakdown_kes": {
            "vehicles": round(vehicle_total_usd * fx, 2),
            "guide": round(guide_total_usd * fx, 2),
            "accommodation": round(lodge_total_usd * fx, 2),
            "conservation_fees": round(park_fees_kes, 2),
        },
        "gross_total_usd": gross_total_usd,
        "quoted_total_usd": net_total_usd,
        "quoted_total_kes": net_total_kes,
    }


def persist_booking_transaction(
    thread_id: str,
    quote: dict[str, Any],
    status: str,
    idempotency_key: str | None = None,
    db_path: Path | None = None,
) -> int | None:
    if "error" in quote or not quote.get("circuit"):
        return None
    circuit = quote["circuit"]
    assigned_vehicles = quote.get("assigned_vehicles", [])
    assigned_guides = quote.get("assigned_guides") or ([quote["guide"]] if quote.get("guide") else [])
    lead_guide = assigned_guides[0] if assigned_guides else None
    vehicle_codes = quote.get("vehicle_codes", [])
    start_date = quote["start_date"]
    end_date = quote["end_date"]

    with write_tx(db_path) as conn:
        if status == "confirmed":
            for v in assigned_vehicles:
                conflict = conn.execute(
                    """
                    SELECT 1 FROM vehicle_allocations
                    WHERE vehicle_id = ?
                      AND status = 'active'
                      AND NOT (end_date < ? OR start_date > ?)
                    LIMIT 1
                    """,
                    (v["id"], start_date, end_date),
                ).fetchone()
                if conflict:
                    raise BookingConflictError(
                        f"Vehicle {v['code']} was allocated to another trip for {start_date}..{end_date}."
                    )

            for g in assigned_guides:
                g_conflict = conn.execute(
                    """
                    SELECT 1 FROM booking_guides bg
                    JOIN bookings b ON b.id = bg.booking_id
                    WHERE bg.guide_id = ?
                      AND bg.status = 'active'
                      AND b.status = 'confirmed'
                      AND NOT (bg.end_date < ? OR bg.start_date > ?)
                    LIMIT 1
                    """,
                    (g["id"], start_date, end_date),
                ).fetchone()
                if g_conflict:
                    raise BookingConflictError(
                        f"Guide {g['name']} was booked on another trip for {start_date}..{end_date}."
                    )

        cur = conn.execute(
            """
            INSERT INTO bookings (
                idempotency_key, thread_id, circuit_id, vehicle_codes_json, guide_id,
                start_date, end_date, adults, children, infants_under_5, residency_tier,
                discount_pct, quoted_total_usd, quoted_total_kes, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                idempotency_key,
                thread_id,
                circuit["id"],
                json.dumps(vehicle_codes),
                lead_guide["id"] if (lead_guide and status == "confirmed") else None,
                start_date,
                end_date,
                quote["adults"],
                quote["children"],
                quote["infants_under_5"],
                quote["residency_tier"],
                quote["discount_pct"],
                quote["quoted_total_usd"],
                quote["quoted_total_kes"],
                status,
            ),
        )
        booking_id = int(cur.lastrowid)

        if status == "confirmed":
            for v in assigned_vehicles:
                conn.execute(
                    """
                    INSERT INTO vehicle_allocations (
                        booking_id, vehicle_id, start_date, end_date, assigned_pax, status
                    ) VALUES (?, ?, ?, ?, ?, 'active')
                    """,
                    (booking_id, v["id"], start_date, end_date, v["assigned_pax"]),
                )
            for g in assigned_guides:
                conn.execute(
                    """
                    INSERT INTO booking_guides (
                        booking_id, guide_id, start_date, end_date, status
                    ) VALUES (?, ?, ?, ?, 'active')
                    """,
                    (booking_id, g["id"], start_date, end_date),
                )

        return booking_id
