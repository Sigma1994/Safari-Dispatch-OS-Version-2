import json
import os
import sqlite3
import urllib.request
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from langgraph.types import Command
from pydantic import BaseModel, Field
from src.db import CHECKPOINT_DB_PATH, DB_PATH, init_db, read_conn, write_tx
from src.graph import get_compiled_graph
from src.pricing import BookingConflictError

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db(DB_PATH, CHECKPOINT_DB_PATH)
    yield


app = FastAPI(title="Safari Dispatch OS", version="1.1.0", lifespan=lifespan)
if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


class InquiryRequest(BaseModel):
    message: str = Field(..., min_length=1)
    thread_id: str | None = None


class ApprovalResolutionRequest(BaseModel):
    approved: bool
    reviewer: str = "operations-manager"
    note: str | None = None


@app.get("/")
def serve_console():
    index_file = WEB_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"status": "ok", "service": "Safari Dispatch OS"}


@app.get("/api/health")
def health_check() -> dict[str, Any]:
    deterministic = os.getenv("USE_DETERMINISTIC_LLM", "1").strip().lower() in {"1", "true", "yes"}
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "qwen3:4b")
    ollama_status: dict[str, Any] = {"reachable": False, "model_installed": False, "model": model}

    if not deterministic:
        try:
            with urllib.request.urlopen(f"{base_url}/api/tags", timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = [m.get("name", "") for m in data.get("models", [])]
                ollama_status["reachable"] = True
                ollama_status["model_installed"] = any(m == model or m.startswith(f"{model}:") for m in models)
        except Exception as exc:
            ollama_status["error"] = str(exc)

    return {
        "status": "ok",
        "mode": "deterministic" if deterministic else "ollama",
        "ollama": ollama_status,
    }


@app.post("/api/inquiries")
def submit_inquiry(
    payload: InquiryRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, Any]:
    if idempotency_key:
        with read_conn(DB_PATH) as conn:
            row = conn.execute(
                "SELECT response_json FROM idempotency_records WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if row:
                cached = json.loads(row["response_json"])
                cached["idempotent_replay"] = True
                return cached

    thread_id = payload.thread_id or f"thr-{uuid.uuid4().hex[:10]}"
    graph, conn = get_compiled_graph(DB_PATH, CHECKPOINT_DB_PATH)
    config = {"configurable": {"thread_id": thread_id}}

    try:
        prior_slots = None
        if payload.thread_id:
            existing_snap = graph.get_state(config)
            if existing_snap and existing_snap.values:
                prior_slots = existing_snap.values.get("slots")

        out = graph.invoke(
            {
                "thread_id": thread_id,
                "idempotency_key": idempotency_key,
                "user_message": payload.message,
                "prior_slots": prior_slots,
                "slots": {},
                "quote": None,
                "critique": None,
                "retry_count": 0,
                "human_approved": None,
                "reviewer": None,
                "outcome_status": "processing",
                "final_response": "",
            },
            config=config,
        )
        snap = graph.get_state(config)
        paused = bool(snap.next)
        interrupt_payload = None

        if paused and snap.tasks and snap.tasks[0].interrupts:
            interrupt_payload = snap.tasks[0].interrupts[0].value
            with write_tx(DB_PATH) as wconn:
                wconn.execute(
                    """
                    INSERT OR REPLACE INTO pending_approvals (
                        thread_id, idempotency_key, user_message, slots_json, quote_json, critique_json, status
                    ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
                    """,
                    (
                        thread_id,
                        idempotency_key,
                        payload.message,
                        json.dumps(out.get("slots") or {}, default=str),
                        json.dumps(out.get("quote") or {}, default=str),
                        json.dumps(out.get("critique") or {}, default=str),
                    ),
                )

        response_obj = {
            "thread_id": thread_id,
            "paused_for_approval": paused,
            "status": "awaiting_approval" if paused else out.get("outcome_status", "completed"),
            "final_response": (
                "Awaiting operator approval before finalizing quote."
                if paused
                else out.get("final_response", "")
            ),
            "slots": out.get("slots"),
            "quote": out.get("quote"),
            "critique": out.get("critique"),
            "interrupt": interrupt_payload,
            "idempotent_replay": False,
        }

        if idempotency_key:
            with write_tx(DB_PATH) as wconn:
                wconn.execute(
                    """
                    INSERT OR IGNORE INTO idempotency_records (idempotency_key, thread_id, response_json)
                    VALUES (?, ?, ?)
                    """,
                    (idempotency_key, thread_id, json.dumps(response_obj, default=str)),
                )

        return response_obj
    finally:
        conn.close()


@app.get("/api/approvals")
def list_pending_approvals() -> list[dict[str, Any]]:
    with read_conn(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT * FROM pending_approvals WHERE status = 'pending' ORDER BY created_at DESC"
        ).fetchall()
    result = []
    for r in rows:
        item = dict(r)
        item["slots"] = json.loads(item.pop("slots_json"))
        item["quote"] = json.loads(item.pop("quote_json"))
        item["critique"] = json.loads(item.pop("critique_json"))
        result.append(item)
    return result


@app.post("/api/approvals/{thread_id}/resolve")
def resolve_approval(thread_id: str, req: ApprovalResolutionRequest) -> dict[str, Any]:
    with read_conn(DB_PATH) as conn:
        pending = conn.execute(
            "SELECT * FROM pending_approvals WHERE thread_id = ? AND status = 'pending'",
            (thread_id,),
        ).fetchone()
    if not pending:
        raise HTTPException(status_code=404, detail=f"No pending approval found for thread '{thread_id}'.")

    graph, conn = get_compiled_graph(DB_PATH, CHECKPOINT_DB_PATH)
    config = {"configurable": {"thread_id": thread_id}}
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        resumed = graph.invoke(
            Command(resume={"approved": req.approved, "reviewer": req.reviewer, "note": req.note}),
            config=config,
        )
        with write_tx(DB_PATH) as wconn:
            wconn.execute(
                """
                UPDATE pending_approvals
                SET status = ?, reviewer = ?, resolution_note = ?, resolved_at = ?
                WHERE thread_id = ?
                """,
                ("approved" if req.approved else "rejected", req.reviewer, req.note, now_iso, thread_id),
            )

        return {
            "thread_id": thread_id,
            "approved": req.approved,
            "reviewer": req.reviewer,
            "status": resumed.get("outcome_status", "completed"),
            "final_response": resumed.get("final_response", ""),
            "quote": resumed.get("quote"),
        }
    except BookingConflictError as exc:
        with write_tx(DB_PATH) as wconn:
            wconn.execute(
                """
                UPDATE pending_approvals
                SET status = 'conflict', reviewer = ?, resolution_note = ?, resolved_at = ?
                WHERE thread_id = ?
                """,
                (req.reviewer, str(exc), now_iso, thread_id),
            )
        raise HTTPException(status_code=409, detail=str(exc))
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


@app.get("/api/bookings")
def list_bookings() -> list[dict[str, Any]]:
    with read_conn(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT b.*, c.name AS circuit_name, g.name AS guide_name
            FROM bookings b
            JOIN circuits c ON c.id = b.circuit_id
            LEFT JOIN guides g ON g.id = b.guide_id
            ORDER BY b.id DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/audit/{thread_id}")
def get_audit_trail(thread_id: str) -> list[dict[str, Any]]:
    with read_conn(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT * FROM audit_log WHERE thread_id = ? ORDER BY id ASC",
            (thread_id,),
        ).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        try:
            item["details"] = json.loads(item.pop("details_json"))
        except Exception:
            item["details"] = item.pop("details_json")
        out.append(item)
    return out
