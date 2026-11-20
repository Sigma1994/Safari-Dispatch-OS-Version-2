import logging
import os
import re
from datetime import date
from pathlib import Path
from typing import Any
from langchain_ollama import ChatOllama
from langgraph.types import interrupt
from src.db import log_audit
from src.pricing import build_safari_quote, persist_booking_transaction
from src.state import CritiqueResult, DispatchState, InquirySlots

logger = logging.getLogger(__name__)


def _max_discount() -> float:
    try:
        return float(os.getenv("MAX_AUTO_DISCOUNT_PCT", "10.0"))
    except ValueError:
        return 10.0


def _max_drive_hours() -> float:
    try:
        return float(os.getenv("MAX_DAILY_DRIVE_HOURS_SAFE", "7.5"))
    except ValueError:
        return 7.5


def _use_deterministic() -> bool:
    return os.getenv("USE_DETERMINISTIC_LLM", "1").strip().lower() in {"1", "true", "yes"}


def _llm() -> ChatOllama:
    timeout = float(os.getenv("OLLAMA_TIMEOUT_SEC", "30"))
    return ChatOllama(
        model=os.getenv("OLLAMA_MODEL", "qwen3:4b"),
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        temperature=0,
        reasoning=False,
        client_kwargs={"timeout": timeout},
    )


def _heuristic_extract(message: str) -> InquirySlots:
    text = message.lower()
    sw_words = ["tunataka", "watu", "bei", "gari", "safari", "kuanzia", "naomba", "tafadhali", "punguzo", "watoto", "wakenya"]
    en_words = ["quote", "book", "people", "guests", "pax", "discount", "vehicle", "guide", "days", "children", "kids", "adults"]
    has_sw = any(w in text for w in sw_words)
    has_en = any(w in text for w in en_words)
    lang = "mixed" if (has_sw and has_en) else ("sw" if has_sw else "en")

    circuit_map = {
        "grand rift": "Grand Rift & Mara Marathon",
        "mara": "Maasai Mara Classic",
        "amboseli": "Amboseli Kilimanjaro Loop",
        "tsavo": "Tsavo East & West Expedition",
        "nakuru": "Lake Nakuru Flamingo & Rift",
        "samburu": "Samburu Ewaso Nyiro Safari",
    }
    circuit_name = next((v for k, v in circuit_map.items() if k in text), None)
    if not circuit_name:
        explicit_park = re.search(r"\b(?:for|to|ya|safari ya)\s+([A-Z][a-zA-Z]{3,}(?:\s+[A-Z][a-zA-Z]+)?)", message)
        if explicit_park:
            candidate = explicit_park.group(1).strip()
            if candidate not in {"Quote", "Book", "Adults", "People", "Guests", "Starting", "Please"}:
                circuit_name = candidate

    residency_tier: str | None = None
    if any(k in text for k in ["ea citizen", "east african citizen", "mwananchi", "kenyan citizen", "raia wa kenya", "wakenya"]):
        residency_tier = "ea_citizen"
    elif any(k in text for k in ["kenya resident", "resident permit", "mkazi"]):
        residency_tier = "ke_resident"
    elif any(k in text for k in ["african citizen", "raia wa afrika"]):
        residency_tier = "af_citizen"
    elif any(k in text for k in ["non resident", "non-resident", "foreign", "mgeni"]):
        residency_tier = "non_resident"

    adults_match = re.search(r"\b(\d{1,2})\s*(?:adults?|watu wazima)\b", text)
    children_match = re.search(r"\b(\d{1,2})\s*(?:children|kids|watoto)\b", text)
    infants_match = re.search(r"\b(\d{1,2})\s*(?:infants?|under[- ]?5|toddlers?)\b", text)
    general_pax_match = re.search(r"\b(\d{1,2})\s*(?:pax|people|guests|watu|persons)\b", text)

    adults: int | None = int(adults_match.group(1)) if adults_match else None
    children = int(children_match.group(1)) if children_match else 0
    infants = int(infants_match.group(1)) if infants_match else 0
    if adults is None and general_pax_match:
        adults = max(int(general_pax_match.group(1)) - children - infants, 0)

    disc_match = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    discount_pct = float(disc_match.group(1)) if disc_match else 0.0

    date_match = re.search(r"\b(202\d-\d{2}-\d{2})\b", message)
    start_date = date_match.group(1) if date_match else None

    senior_guide = any(k in text for k in ["senior guide", "experienced guide", "mwongozo mzuri"])

    return InquirySlots(
        intent="quote_request",
        language=lang,
        circuit_name=circuit_name,
        start_date=start_date,
        adults=adults,
        children=children,
        infants_under_5=infants,
        residency_tier=residency_tier,
        prefer_senior_guide=senior_guide,
        discount_pct=discount_pct,
        missing_fields=[],
    )


def _merge_slots(prior: dict[str, Any] | None, current: InquirySlots) -> dict[str, Any]:
    cur = current.model_dump()
    if not prior:
        if not cur.get("start_date"):
            cur["start_date"] = "2026-12-15"
        if not cur.get("residency_tier"):
            cur["residency_tier"] = "non_resident"
        return cur

    merged = dict(prior)
    if cur.get("circuit_name"):
        merged["circuit_name"] = cur["circuit_name"]
    if cur.get("start_date"):
        merged["start_date"] = cur["start_date"]
    elif not merged.get("start_date"):
        merged["start_date"] = "2026-12-15"

    if cur.get("adults") is not None and cur["adults"] > 0:
        merged["adults"] = cur["adults"]
    if cur.get("children", 0) > 0:
        merged["children"] = cur["children"]
    if cur.get("infants_under_5", 0) > 0:
        merged["infants_under_5"] = cur["infants_under_5"]
    if cur.get("residency_tier"):
        merged["residency_tier"] = cur["residency_tier"]
    elif not merged.get("residency_tier"):
        merged["residency_tier"] = "non_resident"

    if cur.get("prefer_senior_guide"):
        merged["prefer_senior_guide"] = True
    if cur.get("discount_pct", 0.0) > 0:
        merged["discount_pct"] = cur["discount_pct"]
    if cur.get("language"):
        merged["language"] = cur["language"]
    return merged


def intake_node(state: DispatchState, db_path: Path | None = None) -> dict[str, Any]:
    msg = state["user_message"]
    extraction_source = "heuristic"
    fallback_error = None

    if _use_deterministic():
        parsed = _heuristic_extract(msg)
    else:
        try:
            extractor = _llm().with_structured_output(InquirySlots, method="json_schema")
            parsed = extractor.invoke(
                [
                    (
                        "system",
                        "Extract Kenyan safari inquiry slots from English, Swahili, or mixed text.\n"
                        "Valid circuit_name values: 'Maasai Mara Classic', 'Amboseli Kilimanjaro Loop', "
                        "'Tsavo East & West Expedition', 'Lake Nakuru Flamingo & Rift', "
                        "'Samburu Ewaso Nyiro Safari', 'Grand Rift & Mara Marathon'.\n"
                        "Residency tiers: ea_citizen, ke_resident, af_citizen, non_resident (or null if unmentioned).\n"
                        "Only set start_date if explicitly mentioned in ISO YYYY-MM-DD format.",
                    ),
                    ("human", msg),
                ]
            )
            extraction_source = f"ollama:{os.getenv('OLLAMA_MODEL', 'qwen3:4b')}"
        except Exception as exc:
            logger.warning("Ollama extraction failed, falling back to heuristics: %s", exc)
            fallback_error = str(exc)
            parsed = _heuristic_extract(msg)
            extraction_source = "heuristic_fallback"

    slots = _merge_slots(state.get("prior_slots"), parsed)

    missing: list[str] = []
    if not slots.get("circuit_name"):
        missing.append("circuit_name")
    if slots.get("adults") is None or int(slots.get("adults") or 0) <= 0:
        missing.append("adults")

    try:
        date.fromisoformat(str(slots.get("start_date", "")))
    except ValueError:
        missing.append("valid_start_date_YYYY_MM_DD")

    slots["missing_fields"] = missing
    slots["intent"] = "clarification_needed" if missing else "quote_request"
    slots["extraction_source"] = extraction_source
    if fallback_error:
        slots["fallback_error"] = fallback_error

    log_audit(state["thread_id"], "intake", slots["intent"], slots, db_path=db_path)
    return {"slots": slots, "retry_count": 0}


def clarification_node(state: DispatchState, db_path: Path | None = None) -> dict[str, Any]:
    slots = state.get("slots") or {}
    missing = slots.get("missing_fields", ["circuit_name", "adults"])
    lang = slots.get("language", "en")
    labels = [m.replace("_", " ") for m in missing]
    if lang == "sw":
        text = f"Tafadhali taja maelezo haya ili tuandae nukuu kamili ya safari: {', '.join(labels)}."
    else:
        text = f"Please confirm the following details so we can generate your safari quote: {', '.join(labels)}."

    log_audit(state["thread_id"], "clarification", "clarification_needed", {"text": text, "missing": missing}, db_path=db_path)
    return {"outcome_status": "clarification_needed", "final_response": text}


def specialist_node(state: DispatchState, db_path: Path | None = None) -> dict[str, Any]:
    slots = dict(state.get("slots") or {})
    critique = state.get("critique") or {}
    retry_count = int(state.get("retry_count", 0))

    if critique and critique.get("hard_failures"):
        retry_count += 1
        failures_text = " ".join(critique.get("hard_failures", [])).lower()
        if "safari guides" in failures_text and slots.get("prefer_senior_guide"):
            slots["prefer_senior_guide"] = False

    quote = build_safari_quote(
        circuit_query=slots.get("circuit_name") or "",
        adults=int(slots.get("adults") or 0),
        children=int(slots.get("children") or 0),
        infants_under_5=int(slots.get("infants_under_5") or 0),
        residency_tier=slots.get("residency_tier") or "non_resident",
        start_date=slots.get("start_date") or "2026-12-15",
        prefer_senior_guide=bool(slots.get("prefer_senior_guide", False)),
        discount_pct=float(slots.get("discount_pct") or 0.0),
        db_path=db_path,
    )

    log_audit(state["thread_id"], "specialist", f"attempt_{retry_count}", {"slots": slots, "quote": quote}, db_path=db_path)
    return {"slots": slots, "quote": quote, "retry_count": retry_count}


def critic_node(state: DispatchState, db_path: Path | None = None) -> dict[str, Any]:
    quote = state.get("quote") or {}
    hard_failures: list[str] = []
    soft_reasons: list[str] = []

    if "error" in quote:
        hard_failures.append(quote["error"])
    else:
        uncovered = int(quote.get("uncovered_pax", 0))
        if uncovered > 0:
            hard_failures.append(f"Insufficient available fleet capacity: {uncovered} guest(s) could not be seated.")

        shortfall = int(quote.get("guides_shortfall", 0))
        if shortfall > 0:
            hard_failures.append(
                f"Insufficient available safari guides: need {quote.get('guides_required')}, found {len(quote.get('assigned_guides', []))}."
            )

    assigned_vehicles = quote.get("assigned_vehicles") or []
    multi_vehicle = len(assigned_vehicles) > 1
    if multi_vehicle:
        soft_reasons.append(
            f"Multi-vehicle dispatch ({len(assigned_vehicles)} vehicles: {', '.join(quote.get('vehicle_codes', []))}) requires supervisor sign-off."
        )

    circuit = quote.get("circuit") or {}
    drive_hrs = float(circuit.get("max_daily_drive_hours", 0.0))
    if circuit and drive_hrs > _max_drive_hours():
        soft_reasons.append(f"Daily drive hours ({drive_hrs}h) exceed {_max_drive_hours()}h standard comfort limit.")

    discount = float(quote.get("discount_pct", 0.0))
    if discount > _max_discount():
        soft_reasons.append(f"Discount ({discount}%) exceeds {_max_discount()}% auto-approval ceiling.")

    requires_human = (not hard_failures) and bool(soft_reasons)
    approved = (not hard_failures) and (not soft_reasons)
    reasons = hard_failures + soft_reasons

    critique = CritiqueResult(
        approved=approved,
        requires_human_approval=requires_human,
        hard_failures=hard_failures,
        reasons=reasons,
        multi_vehicle_used=multi_vehicle,
    ).model_dump()

    log_audit(state["thread_id"], "critic", f"approved={approved}", critique, db_path=db_path)
    return {"critique": critique}


def human_approval_node(state: DispatchState, db_path: Path | None = None) -> dict[str, Any]:
    quote = state.get("quote") or {}
    critique = state.get("critique") or {}

    decision = interrupt(
        {
            "thread_id": state["thread_id"],
            "circuit": (quote.get("circuit") or {}).get("name"),
            "dates": f"{quote.get('start_date')} to {quote.get('end_date')}",
            "total_pax": quote.get("total_pax"),
            "residency_tier": quote.get("residency_tier"),
            "vehicle_codes": quote.get("vehicle_codes", []),
            "guide_names": [g["name"] for g in quote.get("assigned_guides", [])],
            "quoted_total_usd": quote.get("quoted_total_usd"),
            "quoted_total_kes": quote.get("quoted_total_kes"),
            "reasons": critique.get("reasons", []),
        }
    )

    approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
    reviewer = decision.get("reviewer", "dispatch-supervisor") if isinstance(decision, dict) else "dispatch-supervisor"
    log_audit(
        state["thread_id"],
        "human_approval",
        f"approved={approved}",
        {"approved": approved, "reviewer": reviewer},
        db_path=db_path,
    )
    return {"human_approved": approved, "reviewer": reviewer}


def finalizer_node(state: DispatchState, db_path: Path | None = None) -> dict[str, Any]:
    quote = state.get("quote") or {}
    critique = state.get("critique") or {}
    human_approved = state.get("human_approved")
    thread_id = state["thread_id"]
    hard_failures = critique.get("hard_failures") or []

    if "error" in quote:
        status = "rejected"
        text = f"Quote rejected: {quote['error']}"
    elif hard_failures:
        status = "rejected"
        text = "Quote rejected: " + "; ".join(hard_failures)
    elif critique.get("requires_human_approval") and human_approved is False:
        status = "held"
        text = "Quote held: supervisor declined policy/discount/multi-vehicle exception."
        persist_booking_transaction(thread_id, quote, status="held", idempotency_key=state.get("idempotency_key"), db_path=db_path)
    elif not critique.get("approved", False) and not (critique.get("requires_human_approval") and human_approved is True):
        status = "rejected"
        text = "Quote could not be confirmed: " + "; ".join(critique.get("reasons", ["policy check failed"]))
    else:
        status = "confirmed"
        booking_id = persist_booking_transaction(
            thread_id,
            quote,
            status="confirmed",
            idempotency_key=state.get("idempotency_key"),
            db_path=db_path,
        )
        c = quote["circuit"]
        guides_str = ", ".join(g["name"] for g in quote.get("assigned_guides", [])) or "Unassigned"
        vehicles_str = ", ".join(quote.get("vehicle_codes", [])) or "None"
        text = (
            f"Confirmed Booking #{booking_id} — {c['name']} ({c['days']}d, {quote['start_date']} to {quote['end_date']}, "
            f"{quote['season']} season, {quote['residency_tier']}, {quote['total_pax']} pax) | "
            f"Vehicles: {vehicles_str} | Guides: {guides_str} | "
            f"Total: USD {quote['quoted_total_usd']:.2f} (KES {quote['quoted_total_kes']:,.2f})."
        )

    log_audit(thread_id, "finalizer", status, {"final_response": text}, db_path=db_path)
    return {"outcome_status": status, "final_response": text}
