import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer as createViteServer } from "vite";
import {
  DEFAULT_CHECKPOINT_DB_PATH,
  DEFAULT_DB_PATH,
  getDbStatus,
  initDb,
  readConn,
  writeTx,
} from "./server/db.ts";
import { BookingConflictError } from "./server/pricing.ts";
import { isOnlineLlmEnabled, useDeterministicLlm } from "./server/nlu.ts";
import { runVerificationSuite } from "./server/testRunner.ts";
import { resumeApprovalWorkflow, runInquiryWorkflow } from "./server/workflow.ts";
import type { NluMode } from "./server/types.ts";

const PORT = 3000;
const ROOT = process.cwd();

async function createApp() {
  const activeStorage = await initDb(DEFAULT_DB_PATH, DEFAULT_CHECKPOINT_DB_PATH);
  console.log(`[DB] Active storage engine: ${activeStorage}`);

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_req, res) => {
    const deterministic = useDeterministicLlm();
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
    const model = process.env.OLLAMA_MODEL ?? "qwen3:4b";
    const onlineLlmEnabled = isOnlineLlmEnabled();

    const ollama: {
      reachable: boolean;
      model_installed: boolean;
      model: string;
      base_url: string;
      error?: string;
    } = {
      reachable: false,
      model_installed: false,
      model,
      base_url: baseUrl,
    };

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 1500);
      const tagRes = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(t);
      if (tagRes.ok) {
        const data = (await tagRes.json()) as { models?: Array<{ name?: string }> };
        const names = (data.models ?? []).map((m) => m.name ?? "");
        ollama.reachable = true;
        ollama.model_installed = names.some((n) => n === model || n.startsWith(`${model}:`));
      }
    } catch (err) {
      ollama.error = err instanceof Error ? err.message : String(err);
    }

    const database = await getDbStatus();

    res.json({
      status: "ok",
      mode: deterministic ? "deterministic" : "ollama",
      gemini_configured: onlineLlmEnabled,
      online_llm_enabled: onlineLlmEnabled,
      database,
      policy: {
        usd_to_kes_rate: Number(process.env.USD_TO_KES_RATE ?? "129.5"),
        max_auto_discount_pct: Number(process.env.MAX_AUTO_DISCOUNT_PCT ?? "10.0"),
        max_daily_drive_hours_safe: Number(process.env.MAX_DAILY_DRIVE_HOURS_SAFE ?? "7.5"),
      },
      ollama,
    });
  });

  app.post("/api/inquiries", async (req, res) => {
    const body = (req.body ?? {}) as {
      message?: unknown;
      thread_id?: unknown;
      customer_name?: unknown;
      mode?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      res.status(400).json({ detail: "Inquiry message must be a non-empty string." });
      return;
    }

    const customerName =
      typeof body.customer_name === "string" && body.customer_name.trim()
        ? body.customer_name.trim()
        : null;

    const idempotencyKey = req.header("Idempotency-Key")?.trim() || null;
    if (idempotencyKey) {
      const cached = await readConn(
        (conn) =>
          conn.get<{ response_json: string }>(
            "SELECT response_json FROM idempotency_records WHERE idempotency_key = ?",
            idempotencyKey
          ),
        DEFAULT_DB_PATH
      );

      if (cached) {
        const parsed = JSON.parse(cached.response_json);
        parsed.idempotent_replay = true;
        res.json(parsed);
        return;
      }
    }

    const threadId =
      typeof body.thread_id === "string" && body.thread_id.trim()
        ? body.thread_id.trim()
        : `thr-${crypto.randomBytes(5).toString("hex")}`;

    const requestedMode: NluMode | undefined =
      body.mode === "deterministic" || body.mode === "ollama" || body.mode === "gemini"
        ? body.mode
        : undefined;

    try {
      const responseObj = await runInquiryWorkflow({
        threadId,
        message,
        customerName,
        idempotencyKey,
        nluMode: requestedMode,
        dbPath: DEFAULT_DB_PATH,
        checkpointDbPath: DEFAULT_CHECKPOINT_DB_PATH,
      });

      if (idempotencyKey) {
        await writeTx(async (conn) => {
          await conn.run(
            `
            INSERT INTO idempotency_records (idempotency_key, thread_id, response_json)
            VALUES (?, ?, ?)
            ON CONFLICT (idempotency_key) DO NOTHING
            `,
            idempotencyKey,
            threadId,
            JSON.stringify(responseObj)
          );
        }, DEFAULT_DB_PATH);
      }

      res.json(responseObj);
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/approvals", async (_req, res) => {
    const rows = await readConn(
      (conn) => conn.all("SELECT * FROM pending_approvals WHERE status = 'pending' ORDER BY created_at DESC"),
      DEFAULT_DB_PATH
    );
    const formatted = rows.map((r) => {
      const { slots_json, quote_json, critique_json, ...rest } = r;
      return {
        ...rest,
        slots: JSON.parse(String(slots_json ?? "{}")),
        quote: JSON.parse(String(quote_json ?? "{}")),
        critique: JSON.parse(String(critique_json ?? "{}")),
      };
    });
    res.json(formatted);
  });

  app.post("/api/approvals/:threadId/resolve", async (req, res) => {
    const { threadId } = req.params;
    const body = (req.body ?? {}) as { approved?: unknown; reviewer?: unknown; note?: unknown };
    if (typeof body.approved !== "boolean") {
      res.status(400).json({ detail: "'approved' boolean field is required." });
      return;
    }
    const reviewer = typeof body.reviewer === "string" && body.reviewer.trim() ? body.reviewer.trim() : "operations-manager";
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    const pending = await readConn(
      (conn) =>
        conn.get("SELECT * FROM pending_approvals WHERE thread_id = ? AND status = 'pending'", threadId),
      DEFAULT_DB_PATH
    );

    if (!pending) {
      res.status(404).json({ detail: `No pending approval found for thread '${threadId}'.` });
      return;
    }

    const nowIso = new Date().toISOString();
    try {
      const resumed = await resumeApprovalWorkflow({
        threadId,
        approved: body.approved,
        reviewer,
        note,
        dbPath: DEFAULT_DB_PATH,
        checkpointDbPath: DEFAULT_CHECKPOINT_DB_PATH,
      });

      await writeTx(async (conn) => {
        await conn.run(
          `
          UPDATE pending_approvals
          SET status = ?, reviewer = ?, resolution_note = ?, resolved_at = ?
          WHERE thread_id = ?
          `,
          body.approved ? "approved" : "rejected",
          reviewer,
          note,
          nowIso,
          threadId
        );
      }, DEFAULT_DB_PATH);

      res.json(resumed);
    } catch (err) {
      if (err instanceof BookingConflictError) {
        await writeTx(async (conn) => {
          await conn.run(
            `
            UPDATE pending_approvals
            SET status = 'conflict', reviewer = ?, resolution_note = ?, resolved_at = ?
            WHERE thread_id = ?
            `,
            reviewer,
            err.message,
            nowIso,
            threadId
          );
        }, DEFAULT_DB_PATH);
        res.status(409).json({ detail: err.message });
        return;
      }
      res.status(500).json({ detail: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/bookings", async (_req, res) => {
    const rows = await readConn(
      (conn) =>
        conn.all(
          `
          SELECT b.*, c.name AS circuit_name, c.code AS circuit_code, g.name AS guide_name
          FROM bookings b
          JOIN circuits c ON c.id = b.circuit_id
          LEFT JOIN guides g ON g.id = b.guide_id
          ORDER BY b.id DESC
          `
        ),
      DEFAULT_DB_PATH
    );
    res.json(rows);
  });

  app.get("/api/circuits", async (_req, res) => {
    const rows = await readConn(
      (conn) => conn.all("SELECT * FROM circuits ORDER BY id ASC"),
      DEFAULT_DB_PATH
    );
    res.json(rows);
  });

  app.get("/api/fleet", async (req, res) => {
    const startDate = typeof req.query.start_date === "string" ? req.query.start_date.trim() : "2026-12-11";
    const endDate = typeof req.query.end_date === "string" ? req.query.end_date.trim() : startDate;

    const rows = await readConn(async (conn) => {
      const fleet = await conn.all("SELECT * FROM fleet ORDER BY id ASC");
      const out = [];
      for (const v of fleet) {
        const conflict = await conn.get<{ booking_id: number }>(
          `
          SELECT va.booking_id
          FROM vehicle_allocations va
          WHERE va.vehicle_id = ?
            AND va.status = 'active'
            AND NOT (va.end_date < ? OR va.start_date > ?)
          LIMIT 1
          `,
          v.id as number,
          startDate,
          endDate
        );
        out.push({
          ...v,
          is_free_for_dates: v.status === "available" && Number(v.tsv_licensed) === 1 && !conflict,
          conflicting_booking_id: conflict?.booking_id ?? null,
        });
      }
      return out;
    }, DEFAULT_DB_PATH);

    res.json(rows);
  });

  app.get("/api/guides", async (req, res) => {
    const startDate = typeof req.query.start_date === "string" ? req.query.start_date.trim() : "2026-12-11";
    const endDate = typeof req.query.end_date === "string" ? req.query.end_date.trim() : startDate;

    const rows = await readConn(async (conn) => {
      const guides = await conn.all("SELECT * FROM guides ORDER BY id ASC");
      const out = [];
      for (const g of guides) {
        const conflict = await conn.get<{ booking_id: number }>(
          `
          SELECT bg.booking_id
          FROM booking_guides bg
          JOIN bookings b ON b.id = bg.booking_id
          WHERE bg.guide_id = ?
            AND bg.status = 'active'
            AND b.status = 'confirmed'
            AND NOT (bg.end_date < ? OR bg.start_date > ?)
          LIMIT 1
          `,
          g.id as number,
          startDate,
          endDate
        );
        out.push({
          ...g,
          is_free_for_dates: g.status === "available" && !conflict,
          conflicting_booking_id: conflict?.booking_id ?? null,
        });
      }
      return out;
    }, DEFAULT_DB_PATH);

    res.json(rows);
  });

  app.get("/api/audit/:threadId", async (req, res) => {
    const { threadId } = req.params;
    const rows = await readConn(
      (conn) =>
        conn.all("SELECT * FROM audit_log WHERE thread_id = ? ORDER BY id ASC", threadId),
      DEFAULT_DB_PATH
    );
    const out = rows.map((r) => {
      const { details_json, ...rest } = r;
      try {
        return { ...rest, details: JSON.parse(String(details_json ?? "{}")) };
      } catch {
        return { ...rest, details: details_json };
      }
    });
    res.json(out);
  });

  app.post("/api/admin/reset", async (_req, res) => {
    await initDb(DEFAULT_DB_PATH, DEFAULT_CHECKPOINT_DB_PATH, true);
    res.json({ status: "reset_complete" });
  });

  app.post("/api/tests/run", async (_req, res) => {
    const report = await runVerificationSuite();
    res.json(report);
  });

  if (process.env.NODE_ENV !== "production") {
    const disableHmr = process.env.DISABLE_HMR === "true";
    const uidSuffix = typeof process.getuid === "function" ? String(process.getuid()) : "app";
    const vite = await createViteServer({
      configFile: false,
      root: ROOT,
      cacheDir: path.join(os.tmpdir(), `safari-dispatch-vite-cache-${uidSuffix}`),
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          "@": ROOT,
        },
      },
      server: {
        middlewareMode: true,
        hmr: !disableHmr,
        watch: disableHmr ? null : {},
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT, "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  return app;
}

createApp()
  .then((app) => {
    const httpServer = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Safari Dispatch OS running at http://0.0.0.0:${PORT}`);
    });
    httpServer.on("error", (err) => {
      console.error("Safari Dispatch OS HTTP server error:", err);
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("Failed to start Safari Dispatch OS:", err);
    process.exit(1);
  });
