def test_health_endpoint_deterministic(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["mode"] == "deterministic"


def test_multi_turn_clarification_merges_prior_slots(client):
    r1 = client.post("/api/inquiries", json={"message": "Quote for Amboseli please"})
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["status"] == "clarification_needed"
    assert "adults" in b1["slots"]["missing_fields"]
    tid = b1["thread_id"]

    r2 = client.post(
        "/api/inquiries",
        json={"thread_id": tid, "message": "4 adults starting 2026-12-20"},
    )
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["status"] == "confirmed"
    assert b2["quote"]["circuit"]["name"] == "Amboseli Kilimanjaro Loop"
    assert b2["quote"]["adults"] == 4


def test_auto_confirm_and_idempotent_replay(client):
    headers = {"Idempotency-Key": "idem-auto-001"}
    payload = {"message": "Book Lake Nakuru for 2 adults starting 2026-12-20"}

    r1 = client.post("/api/inquiries", json=payload, headers=headers)
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["status"] == "confirmed"
    assert b1["idempotent_replay"] is False

    r2 = client.post("/api/inquiries", json=payload, headers=headers)
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["idempotent_replay"] is True
    assert b2["thread_id"] == b1["thread_id"]

    bookings = client.get("/api/bookings").json()
    assert len(bookings) == 2


def test_hitl_interrupt_and_approve(client):
    res = client.post(
        "/api/inquiries",
        json={"message": "Tunataka quote ya Maasai Mara Classic kwa 10 people kuanzia 2026-12-15 with 15% discount."},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["paused_for_approval"] is True
    assert body["status"] == "awaiting_approval"
    thread_id = body["thread_id"]

    approvals = client.get("/api/approvals").json()
    assert len(approvals) == 1
    assert approvals[0]["thread_id"] == thread_id

    resolved = client.post(
        f"/api/approvals/{thread_id}/resolve",
        json={"approved": True, "reviewer": "ops-lead"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "confirmed"

    audit = client.get(f"/api/audit/{thread_id}").json()
    assert [row["node_name"] for row in audit] == ["intake", "specialist", "critic", "human_approval", "finalizer"]


def test_hitl_reject_holds_without_locking_resources(client):
    res = client.post(
        "/api/inquiries",
        json={"message": "Amboseli for 4 adults starting 2026-12-18 with 20% discount"},
    )
    thread_id = res.json()["thread_id"]

    resolved = client.post(
        f"/api/approvals/{thread_id}/resolve",
        json={"approved": False, "reviewer": "ops-lead"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "held"

    r2 = client.post(
        "/api/inquiries",
        json={"message": "Amboseli for 4 adults starting 2026-12-18"},
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "confirmed"


def test_hard_blocker_never_enters_human_approval(client):
    res = client.post(
        "/api/inquiries",
        json={"message": "Maasai Mara Classic for 30 adults starting 2026-12-11"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["paused_for_approval"] is False
    assert body["status"] == "rejected"
    assert client.get("/api/approvals").json() == []


def test_unknown_circuit_is_rejected_not_mutated(client):
    res = client.post(
        "/api/inquiries",
        json={"message": "Quote for Serengeti for 2 adults"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "rejected"
