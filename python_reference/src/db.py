import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from langgraph.checkpoint.sqlite import SqliteSaver

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" if (ROOT / "data").exists() else ROOT.parent / "data"
DB_PATH = DATA_DIR / "safari_dispatch.db"
CHECKPOINT_DB_PATH = DATA_DIR / "checkpoints.db"
SCHEMA_PATH = DATA_DIR / "schema.sql"
SEED_PATH = DATA_DIR / "seed.sql"


def get_conn(db_path: Path | None = None) -> sqlite3.Connection:
    target = db_path or DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        str(target),
        timeout=30.0,
        check_same_thread=False,
        isolation_level=None,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    return conn


@contextmanager
def read_conn(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    conn = get_conn(db_path)
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def write_tx(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    conn = get_conn(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE;")
        yield conn
        conn.execute("COMMIT;")
    except Exception:
        if conn.in_transaction:
            conn.execute("ROLLBACK;")
        raise
    finally:
        conn.close()


def init_db(
    db_path: Path | None = None,
    checkpoint_db_path: Path | None = None,
    reset: bool = False,
) -> Path:
    target = db_path or DB_PATH
    ckpt = checkpoint_db_path or CHECKPOINT_DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    ckpt.parent.mkdir(parents=True, exist_ok=True)

    if reset:
        if target.exists():
            target.unlink()
        if ckpt.exists():
            ckpt.unlink()

    conn = get_conn(target)
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        conn.executescript(SEED_PATH.read_text(encoding="utf-8"))
    finally:
        conn.close()

    ckpt_conn = sqlite3.connect(str(ckpt), timeout=30.0, check_same_thread=False)
    try:
        ckpt_conn.execute("PRAGMA journal_mode = WAL;")
        ckpt_conn.execute("PRAGMA busy_timeout = 30000;")
        saver = SqliteSaver(ckpt_conn)
        saver.setup()
    finally:
        ckpt_conn.close()

    return target


def log_audit(
    thread_id: str,
    node_name: str,
    decision: str,
    details: dict[str, Any] | str,
    db_path: Path | None = None,
) -> None:
    payload = details if isinstance(details, str) else json.dumps(details, default=str)
    with write_tx(db_path) as conn:
        conn.execute(
            "INSERT INTO audit_log (thread_id, node_name, decision, details_json) VALUES (?, ?, ?, ?)",
            (thread_id, node_name, decision, payload),
        )
