import sqlite3
from pathlib import Path
from typing import Any
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from src import db as db_mod
from src.nodes import (
    clarification_node,
    critic_node,
    finalizer_node,
    human_approval_node,
    intake_node,
    specialist_node,
)
from src.state import DispatchState

MAX_RETRIES = 2


def route_after_intake(state: DispatchState) -> str:
    slots = state.get("slots") or {}
    if slots.get("intent") == "clarification_needed" or slots.get("missing_fields"):
        return "clarification"
    return "specialist"


def route_after_critic(state: DispatchState) -> str:
    critique = state.get("critique") or {}
    slots = state.get("slots") or {}
    hard_failures = critique.get("hard_failures") or []

    if hard_failures:
        failures_text = " ".join(hard_failures).lower()
        can_relax_senior = (
            "safari guides" in failures_text
            and bool(slots.get("prefer_senior_guide"))
            and int(state.get("retry_count", 0)) < MAX_RETRIES
        )
        return "specialist" if can_relax_senior else "finalizer"

    if critique.get("requires_human_approval"):
        return "human_approval"
    if critique.get("approved"):
        return "finalizer"
    return "finalizer"


def build_graph(checkpointer: SqliteSaver, db_path: Path | None = None):
    def _wrap(fn):
        def _inner(state: DispatchState):
            return fn(state, db_path=db_path)
        return _inner

    builder = StateGraph(DispatchState)
    builder.add_node("intake", _wrap(intake_node))
    builder.add_node("clarification", _wrap(clarification_node))
    builder.add_node("specialist", _wrap(specialist_node))
    builder.add_node("critic", _wrap(critic_node))
    builder.add_node("human_approval", _wrap(human_approval_node))
    builder.add_node("finalizer", _wrap(finalizer_node))

    builder.add_edge(START, "intake")
    builder.add_conditional_edges(
        "intake",
        route_after_intake,
        {"clarification": "clarification", "specialist": "specialist"},
    )
    builder.add_edge("clarification", END)
    builder.add_edge("specialist", "critic")
    builder.add_conditional_edges(
        "critic",
        route_after_critic,
        {
            "human_approval": "human_approval",
            "specialist": "specialist",
            "finalizer": "finalizer",
        },
    )
    builder.add_edge("human_approval", "finalizer")
    builder.add_edge("finalizer", END)

    return builder.compile(checkpointer=checkpointer)


def get_compiled_graph(
    db_path: Path | None = None,
    checkpoint_db_path: Path | None = None,
) -> tuple[Any, sqlite3.Connection]:
    business_db = db_path or db_mod.DB_PATH
    ckpt_db = checkpoint_db_path or db_mod.CHECKPOINT_DB_PATH
    ckpt_db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(ckpt_db), timeout=30.0, check_same_thread=False)
    conn.execute("PRAGMA busy_timeout = 30000;")
    saver = SqliteSaver(conn)
    saver.setup()
    return build_graph(saver, db_path=business_db), conn
