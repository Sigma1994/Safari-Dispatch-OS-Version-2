import pytest
from fastapi.testclient import TestClient
from src import api, db


@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    business_db = tmp_path / "test_safari.db"
    ckpt_db = tmp_path / "test_checkpoints.db"
    db.init_db(business_db, ckpt_db, reset=True)

    monkeypatch.setattr(db, "DB_PATH", business_db)
    monkeypatch.setattr(db, "CHECKPOINT_DB_PATH", ckpt_db)
    monkeypatch.setattr(api, "DB_PATH", business_db)
    monkeypatch.setattr(api, "CHECKPOINT_DB_PATH", ckpt_db)

    monkeypatch.setenv("USE_DETERMINISTIC_LLM", "1")
    monkeypatch.setenv("USD_TO_KES_RATE", "129.5")
    monkeypatch.setenv("MAX_AUTO_DISCOUNT_PCT", "10.0")
    monkeypatch.setenv("MAX_DAILY_DRIVE_HOURS_SAFE", "7.5")
    return business_db


@pytest.fixture()
def client(temp_db):
    with TestClient(api.app) as c:
        yield c
