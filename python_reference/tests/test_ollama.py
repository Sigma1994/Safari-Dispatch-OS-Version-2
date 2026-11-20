import pytest
from src.nodes import intake_node


def test_ollama_failure_logs_heuristic_fallback(temp_db, monkeypatch):
    monkeypatch.setenv("USE_DETERMINISTIC_LLM", "0")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:59999")

    out = intake_node(
        {
            "thread_id": "thr-fallback-1",
            "idempotency_key": None,
            "user_message": "Book Maasai Mara for 2 adults starting 2026-12-15",
            "prior_slots": None,
            "slots": {},
            "quote": None,
            "critique": None,
            "retry_count": 0,
            "human_approved": None,
            "reviewer": None,
            "outcome_status": "processing",
            "final_response": "",
        },
        db_path=temp_db,
    )
    assert out["slots"]["extraction_source"] == "heuristic_fallback"
    assert "fallback_error" in out["slots"]
    assert out["slots"]["adults"] == 2


@pytest.mark.ollama
def test_live_ollama_swahili_mixed_extraction(temp_db, monkeypatch):
    monkeypatch.setenv("USE_DETERMINISTIC_LLM", "0")
    out = intake_node(
        {
            "thread_id": "thr-ollama-live-1",
            "idempotency_key": None,
            "user_message": "Habari, sisi ni Wakenya 4 adults na 2 watoto tunataka Maasai Mara kuanzia 2026-12-18",
            "prior_slots": None,
            "slots": {},
            "quote": None,
            "critique": None,
            "retry_count": 0,
            "human_approved": None,
            "reviewer": None,
            "outcome_status": "processing",
            "final_response": "",
        },
        db_path=temp_db,
    )
    slots = out["slots"]
    assert slots["extraction_source"].startswith("ollama:")
    assert slots["adults"] == 4
    assert slots["children"] == 2
    assert slots["residency_tier"] == "ea_citizen"
    assert "mara" in (slots["circuit_name"] or "").lower()
