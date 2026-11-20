import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { initDb, toPgPlaceholders } from "../server/db.ts";
import { runVerificationSuite } from "../server/testRunner.ts";
import { runInquiryWorkflow } from "../server/workflow.ts";
import { matchesBookingSearch } from "../src/components/BookingsLedger.tsx";
import {
  buildChatMlJsonlLine,
  buildStarterDatasetJsonl,
  STARTER_DATASET_PAIRS,
  TRAINING_STEPS,
} from "../src/data/loraPlaybookData.ts";
import type { BookingRecord } from "../src/types.ts";

test("Safari Dispatch OS complete verification suite", async (t) => {
  const report = await runVerificationSuite();
  for (const r of report.results) {
    await t.test(`[${r.category}] ${r.name}`, () => {
      assert.equal(r.passed, true, r.error ?? "Assertion failed");
    });
  }
  assert.equal(report.failed, 0);
});

test("BookingsLedger search filters by circuit name, customer name, and booking ID", () => {
  const sample: BookingRecord = {
    id: 14,
    idempotency_key: null,
    thread_id: "thr-abc123",
    customer_name: "Wanjiru & Associates",
    circuit_id: 2,
    circuit_name: "Amboseli Kilimanjaro Loop",
    circuit_code: "CIR-AMBO-4D",
    vehicle_codes_json: '["LC-02"]',
    guide_id: 1,
    guide_name: "Peter Kamau",
    start_date: "2026-12-10",
    end_date: "2026-12-13",
    adults: 4,
    children: 0,
    infants_under_5: 0,
    residency_tier: "non_resident",
    discount_pct: 0,
    quoted_total_usd: 4320,
    quoted_total_kes: 559440,
    status: "confirmed",
    created_at: "2026-11-19T00:00:00Z",
  };

  assert.equal(matchesBookingSearch(sample, "amboseli"), true);
  assert.equal(matchesBookingSearch(sample, "wanjiru"), true);
  assert.equal(matchesBookingSearch(sample, "14"), true);
  assert.equal(matchesBookingSearch(sample, "#14"), true);
  assert.equal(matchesBookingSearch(sample, "mara"), false);
  assert.equal(matchesBookingSearch(sample, "#99"), false);
});

test("Ollama NLU + Grounded NLG + Grounding Guardrail end-to-end", async () => {
  let callIndex = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/api/chat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as { format?: unknown };
        callIndex += 1;
        res.writeHead(200, { "Content-Type": "application/json" });
        if (parsed.format) {
          // Stage 1: NLU structured extraction response
          res.end(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  intent: "quote_request",
                  language: "en",
                  customer_name: "Amina Safaris",
                  circuit_name: "Lake Nakuru Flamingo & Rift",
                  start_date: "2026-12-20",
                  adults: 2,
                  children: 0,
                  infants_under_5: 0,
                  residency_tier: "non_resident",
                  prefer_senior_guide: false,
                  discount_pct: 0,
                }),
              },
            })
          );
        } else {
          // Stage 5: Grounded NLG response (first call grounded from prompt facts, second call hallucinated)
          const parsedChat = JSON.parse(body) as { messages?: Array<{ content?: string }> };
          const userMsg = parsedChat.messages?.[1]?.content ?? "";
          const matchFacts = userMsg.match(/GROUNDING_FACTS:\n([\s\S]+)$/);
          const facts = matchFacts ? (JSON.parse(matchFacts[1]) as { booking_id?: number; quoted_total_usd?: number }) : {};
          const content =
            callIndex <= 2
              ? `Asante! Your Lake Nakuru Flamingo & Rift safari is confirmed as Booking #${facts.booking_id} for 2026-12-20 to 2026-12-21 at USD ${Number(facts.quoted_total_usd ?? 0).toFixed(2)}.`
              : "Confirmed! Your trip is only $50 total!";
          res.end(JSON.stringify({ message: { content } }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const prevUrl = process.env.OLLAMA_BASE_URL;
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safari-ollama-e2e-"));
  const dbPath = path.join(tmpDir, "safari.db");
  const ckptPath = path.join(tmpDir, "ckpt.db");
  await initDb(dbPath, ckptPath, true);

  try {
    const okRes = await runInquiryWorkflow({
      threadId: "thr-ollama-ok",
      message: "Lake Nakuru for 2 adults starting 2026-12-20",
      nluMode: "ollama",
      dbPath,
      checkpointDbPath: ckptPath,
    });
    assert.equal(okRes.status, "confirmed");
    assert.equal(okRes.ai_trace?.effective_nlu_engine, "ollama:qwen3:4b");
    assert.equal(okRes.ai_trace?.effective_nlg_engine, "ollama:qwen3:4b");
    assert.ok(okRes.final_response.includes("Booking #2"));

    // Second request triggers hallucinated $50 NLG draft -> guardrail catches and reverts to verified template
    const guardRes = await runInquiryWorkflow({
      threadId: "thr-ollama-guard",
      message: "Lake Nakuru for 2 adults starting 2026-12-24",
      nluMode: "ollama",
      dbPath,
      checkpointDbPath: ckptPath,
    });
    assert.equal(guardRes.status, "confirmed");
    assert.equal(guardRes.ai_trace?.effective_nlu_engine, "ollama:qwen3:4b");
    assert.equal(guardRes.ai_trace?.effective_nlg_engine, "template_grounding_guardrail");
    assert.ok(!guardRes.final_response.includes("$50"));
    assert.ok(guardRes.final_response.includes("Booking #3"));
  } finally {
    if (prevUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = prevUrl;
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("PostgreSQL placeholder converter and Docker PostgreSQL schema/seed files are valid", () => {
  const converted = toPgPlaceholders(
    "SELECT * FROM bookings WHERE id = ? AND note = 'what?' AND status = ?"
  );
  assert.equal(
    converted,
    "SELECT * FROM bookings WHERE id = $1 AND note = 'what?' AND status = $2"
  );

  const schemaSql = fs.readFileSync(path.join(process.cwd(), "data", "postgres_schema.sql"), "utf-8");
  const seedSql = fs.readFileSync(path.join(process.cwd(), "data", "postgres_seed.sql"), "utf-8");
  assert.ok(schemaSql.includes("CREATE EXTENSION IF NOT EXISTS btree_gist"));
  assert.ok(schemaSql.includes("EXCLUDE USING gist"));
  assert.ok(schemaSql.includes("workflow_checkpoints"));
  assert.ok(seedSql.includes("ON CONFLICT (id) DO NOTHING"));
  assert.ok(seedSql.includes("setval(pg_get_serial_sequence('bookings', 'id')"));
});

test("LoRA Training Playbook generates valid ChatML JSONL and covers all 6 steps", () => {
  const jsonl = buildStarterDatasetJsonl();
  const lines = jsonl.split("\n").filter(Boolean);
  assert.equal(lines.length, STARTER_DATASET_PAIRS.length);

  for (const line of lines) {
    const parsed = JSON.parse(line) as { messages: Array<{ role: string; content: string }> };
    assert.equal(parsed.messages.length, 3);
    assert.equal(parsed.messages[0].role, "system");
    assert.equal(parsed.messages[1].role, "user");
    assert.equal(parsed.messages[2].role, "assistant");
    if (parsed.messages[0].content.includes("Extract Kenyan safari inquiry slots")) {
      const slots = JSON.parse(parsed.messages[2].content) as Record<string, unknown>;
      assert.ok("circuit_name" in slots && "adults" in slots && "residency_tier" in slots);
    }
  }

  const customLine = JSON.parse(
    buildChatMlJsonlLine({
      task: "nlu",
      userMessage: "Wasee 4 Amboseli 2026-12-10",
      assistantOutput: JSON.stringify({ circuit_name: "Amboseli Kilimanjaro Loop", adults: 4 }),
    })
  ) as { messages: Array<{ role: string; content: string }> };
  assert.equal(customLine.messages[1].content, "Wasee 4 Amboseli 2026-12-10");
  assert.equal(TRAINING_STEPS.length, 6);
});

