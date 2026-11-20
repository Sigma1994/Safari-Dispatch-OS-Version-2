import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { initDb, readConn } from "./db.ts";
import { allocateVehicles, BookingConflictError, buildSafariQuote, persistBookingTransaction } from "./pricing.ts";
import { intakeNode, resumeApprovalWorkflow, runInquiryWorkflow } from "./workflow.ts";
import type { FleetRow } from "./types.ts";

export interface TestCaseResult {
  name: string;
  category: "pricing" | "workflow" | "concurrency" | "nlu";
  passed: boolean;
  duration_ms: number;
  error?: string;
}

export async function runVerificationSuite(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: TestCaseResult[];
}> {
  const cases: Array<{
    name: string;
    category: TestCaseResult["category"];
    fn: (dbPath: string, ckptPath: string) => Promise<void> | void;
  }> = [
    {
      name: "Per-day seasonal & residency conservation fees + 50% child lodge rate",
      category: "pricing",
      fn: async (dbPath) => {
        const highQ = await buildSafariQuote({
          circuitQuery: "Maasai Mara Classic",
          adults: 2,
          children: 1,
          infantsUnder5: 1,
          residencyTier: "ea_citizen",
          startDate: "2026-12-15",
          dbPath,
        });
        const lowQ = await buildSafariQuote({
          circuitQuery: "Maasai Mara Classic",
          adults: 2,
          children: 1,
          infantsUnder5: 1,
          residencyTier: "ea_citizen",
          startDate: "2026-05-15",
          dbPath,
        });
        assert.ok(!("error" in highQ));
        assert.ok(!("error" in lowQ));
        assert.equal(highQ.season, "high");
        assert.equal(lowQ.season, "low");
        assert.equal(highQ.breakdown_kes.conservation_fees, 19500);
        assert.equal(lowQ.breakdown_kes.conservation_fees, 9900);
        assert.equal(highQ.breakdown_usd.accommodation, 725);
      },
    },
    {
      name: "Multi-vehicle dispatch allocates one guide per vehicle",
      category: "pricing",
      fn: async (dbPath) => {
        const q = await buildSafariQuote({
          circuitQuery: "Maasai Mara Classic",
          adults: 10,
          startDate: "2026-12-15",
          dbPath,
        });
        assert.ok(!("error" in q));
        assert.equal(q.uncovered_pax, 0);
        assert.equal(q.assigned_vehicles.length, 2);
        assert.equal(
          q.assigned_vehicles.reduce((s, v) => s + (v.assigned_pax ?? 0), 0),
          10
        );
        assert.equal(q.guides_required, 2);
        assert.equal(q.assigned_guides.length, 2);
        assert.equal(q.guides_shortfall, 0);
      },
    },
    {
      name: "Seeded overlap excludes LC-01 and Peter Kamau for 2026-12-11",
      category: "pricing",
      fn: async (dbPath) => {
        const q = await buildSafariQuote({
          circuitQuery: "Amboseli",
          adults: 4,
          startDate: "2026-12-11",
          dbPath,
        });
        assert.ok(!("error" in q));
        assert.ok(!q.vehicle_codes.includes("LC-01"));
        assert.ok(q.assigned_guides.every((g) => g.name !== "Peter Kamau"));
      },
    },
    {
      name: "Invalid ISO date (2026-02-30) returns explicit validation error",
      category: "pricing",
      fn: async (dbPath) => {
        const q = await buildSafariQuote({
          circuitQuery: "Amboseli",
          adults: 2,
          startDate: "2026-02-30",
          dbPath,
        });
        assert.ok("error" in q);
      },
    },
    {
      name: "Greedy allocator reports uncovered pax when fleet seats fall short",
      category: "pricing",
      fn: () => {
        const fleet: FleetRow[] = [
          {
            id: 1,
            code: "LC-01",
            vehicle_type: "4x4 Cruiser",
            max_pax: 6,
            daily_rate_usd: 235,
            tsv_licensed: 1,
            status: "available",
          },
        ];
        const { assigned, uncoveredPax } = allocateVehicles(fleet, 9);
        assert.equal(assigned.length, 1);
        assert.equal(uncoveredPax, 3);
      },
    },
    {
      name: "TOCTOU protection throws BookingConflictError on overlapping confirmation",
      category: "concurrency",
      fn: async (dbPath) => {
        const q1 = await buildSafariQuote({
          circuitQuery: "Lake Nakuru Flamingo & Rift",
          adults: 2,
          startDate: "2026-12-22",
          dbPath,
        });
        const q2 = await buildSafariQuote({
          circuitQuery: "Lake Nakuru Flamingo & Rift",
          adults: 2,
          startDate: "2026-12-22",
          dbPath,
        });
        const id1 = await persistBookingTransaction({
          threadId: "thr-race-1",
          quote: q1,
          status: "confirmed",
          dbPath,
        });
        assert.ok(id1 !== null);
        await assert.rejects(
          () =>
            persistBookingTransaction({
              threadId: "thr-race-2",
              quote: q2,
              status: "confirmed",
              dbPath,
            }),
          BookingConflictError
        );
      },
    },
    {
      name: "Multi-turn clarification merges prior slots on same thread_id",
      category: "workflow",
      fn: async (dbPath, ckptPath) => {
        const r1 = await runInquiryWorkflow({
          threadId: "thr-clarify-1",
          message: "Quote for Amboseli please",
          nluMode: "deterministic",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(r1.status, "clarification_needed");
        assert.ok(r1.slots?.missing_fields.includes("adults"));

        const r2 = await runInquiryWorkflow({
          threadId: "thr-clarify-1",
          message: "4 adults starting 2026-12-20",
          nluMode: "deterministic",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(r2.status, "confirmed");
        assert.ok(r2.quote && !("error" in r2.quote));
        assert.equal(r2.quote.circuit.name, "Amboseli Kilimanjaro Loop");
        assert.equal(r2.quote.adults, 4);
      },
    },
    {
      name: "HITL interrupt pauses on 10 pax + 15% discount and confirms on approval",
      category: "workflow",
      fn: async (dbPath, ckptPath) => {
        const r1 = await runInquiryWorkflow({
          threadId: "thr-hitl-1",
          message: "Tunataka quote ya Maasai Mara Classic kwa 10 people kuanzia 2026-12-15 with 15% discount.",
          nluMode: "deterministic",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(r1.paused_for_approval, true);
        assert.equal(r1.status, "awaiting_approval");

        const resumed = await resumeApprovalWorkflow({
          threadId: "thr-hitl-1",
          approved: true,
          reviewer: "ops-lead",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(resumed.status, "confirmed");

        const audit = await readConn(
          (conn) =>
            conn.all<{ node_name: string }>(
              "SELECT node_name FROM audit_log WHERE thread_id = ? ORDER BY id ASC",
              "thr-hitl-1"
            ),
          dbPath
        );
        assert.deepEqual(
          audit.map((a) => a.node_name),
          ["intake", "specialist", "critic", "human_approval", "finalizer"]
        );
      },
    },
    {
      name: "Rejected (held) quote does not lock vehicle or guide for subsequent bookings",
      category: "workflow",
      fn: async (dbPath, ckptPath) => {
        const r1 = await runInquiryWorkflow({
          threadId: "thr-hold-1",
          message: "Amboseli for 4 adults starting 2026-12-18 with 20% discount",
          nluMode: "deterministic",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(r1.paused_for_approval, true);

        const held = await resumeApprovalWorkflow({
          threadId: "thr-hold-1",
          approved: false,
          reviewer: "ops-lead",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(held.status, "held");

        const r2 = await runInquiryWorkflow({
          threadId: "thr-hold-2",
          message: "Amboseli for 4 adults starting 2026-12-18",
          nluMode: "deterministic",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(r2.status, "confirmed");
      },
    },
    {
      name: "Hard capacity blocker (30 pax) rejects immediately without entering HITL queue",
      category: "workflow",
      fn: async (dbPath, ckptPath) => {
        const res = await runInquiryWorkflow({
          threadId: "thr-hard-30",
          message: "Maasai Mara Classic for 30 adults starting 2026-12-11",
          nluMode: "deterministic",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(res.paused_for_approval, false);
        assert.equal(res.status, "rejected");
        const pendingCount = await readConn(
          async (conn) =>
            (
              await conn.get<{ cnt: number }>(
                "SELECT COUNT(*) AS cnt FROM pending_approvals WHERE status = 'pending'"
              )
            )?.cnt ?? 0,
          dbPath
        );
        assert.equal(pendingCount, 0);
      },
    },
    {
      name: "Unknown circuit (Serengeti) is rejected rather than silently mutated to Maasai Mara",
      category: "workflow",
      fn: async (dbPath, ckptPath) => {
        const res = await runInquiryWorkflow({
          threadId: "thr-unknown-park",
          message: "Quote for Serengeti for 2 adults starting 2026-12-20",
          nluMode: "deterministic",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(res.status, "rejected");
        assert.ok(res.final_response.toLowerCase().includes("unknown circuit"));
      },
    },
    {
      name: "Unreachable Ollama logs heuristic_fallback and fallback_error transparently",
      category: "nlu",
      fn: async (dbPath) => {
        const prevUrl = process.env.OLLAMA_BASE_URL;
        process.env.OLLAMA_BASE_URL = "http://127.0.0.1:59999";
        try {
          const out = await intakeNode(
            {
              thread_id: "thr-ollama-fallback",
              idempotency_key: null,
              user_message: "Book Maasai Mara for 2 adults and 1 infant starting 2026-12-15",
              prior_slots: null,
              slots: null,
              quote: null,
              critique: null,
              retry_count: 0,
              human_approved: null,
              reviewer: null,
              outcome_status: "processing",
              final_response: "",
            },
            { dbPath, nluMode: "ollama" }
          );
          assert.equal(out.slots?.extraction_source, "heuristic_fallback");
          assert.ok(out.slots?.fallback_error);
          assert.equal(out.slots?.adults, 2);
          assert.equal(out.slots?.infants_under_5, 1);
        } finally {
          if (prevUrl === undefined) delete process.env.OLLAMA_BASE_URL;
          else process.env.OLLAMA_BASE_URL = prevUrl;
        }
      },
    },
    {
      name: "Customer name persists on confirmed bookings for ledger search",
      category: "workflow",
      fn: async (dbPath, ckptPath) => {
        const res = await runInquiryWorkflow({
          threadId: "thr-cust-1",
          message: "Book Lake Nakuru for 2 adults starting 2026-12-20",
          customerName: "David Ndara",
          nluMode: "deterministic",
          dbPath,
          checkpointDbPath: ckptPath,
        });
        assert.equal(res.status, "confirmed");
        const row = await readConn(
          (conn) =>
            conn.get<{ customer_name: string | null }>(
              "SELECT customer_name FROM bookings WHERE thread_id = ?",
              "thr-cust-1"
            ),
          dbPath
        );
        assert.equal(row?.customer_name, "David Ndara");
      },
    },
    {
      name: "AI pipeline trace records all 5 stages and NLG fallback when Ollama is offline",
      category: "nlu",
      fn: async (dbPath, ckptPath) => {
        const prevUrl = process.env.OLLAMA_BASE_URL;
        process.env.OLLAMA_BASE_URL = "http://127.0.0.1:59999";
        try {
          const res = await runInquiryWorkflow({
            threadId: "thr-trace-1",
            message: "Book Lake Nakuru for 2 adults starting 2026-12-20",
            nluMode: "ollama",
            dbPath,
            checkpointDbPath: ckptPath,
          });
          assert.equal(res.status, "confirmed");
          assert.ok(res.ai_trace);
          assert.equal(res.ai_trace.steps.length, 5);
          assert.equal(res.ai_trace.effective_nlu_engine, "heuristic_fallback");
          assert.equal(res.ai_trace.effective_nlg_engine, "template_fallback");
        } finally {
          if (prevUrl === undefined) delete process.env.OLLAMA_BASE_URL;
          else process.env.OLLAMA_BASE_URL = prevUrl;
        }
      },
    },
  ];

  const results: TestCaseResult[] = [];
  for (const tc of cases) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safari-dispatch-test-"));
    const dbPath = path.join(tmpDir, "safari.db");
    const ckptPath = path.join(tmpDir, "ckpt.db");
    await initDb(dbPath, ckptPath, true);

    const start = performance.now();
    try {
      await tc.fn(dbPath, ckptPath);
      results.push({
        name: tc.name,
        category: tc.category,
        passed: true,
        duration_ms: Math.round((performance.now() - start) * 100) / 100,
      });
    } catch (err) {
      results.push({
        name: tc.name,
        category: tc.category,
        passed: false,
        duration_ms: Math.round((performance.now() - start) * 100) / 100,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
