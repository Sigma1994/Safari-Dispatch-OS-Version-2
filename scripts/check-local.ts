import "dotenv/config";
import { closePgPool, getDbStatus } from "../server/db.ts";
import { extractInquirySlots, synthesizeGroundedReply } from "../server/nlu.ts";

async function main() {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL ?? "qwen3:4b";

  console.log("=== Safari Dispatch OS Local Stack Check ===");

  // 1. Check PostgreSQL
  const dbStatus = await getDbStatus();
  if (dbStatus.postgres.reachable) {
    console.log(
      `[OK] PostgreSQL reachable at ${dbStatus.postgres.host}:${dbStatus.postgres.port}/${dbStatus.postgres.database}`
    );
  } else {
    console.log(
      `[WARN] PostgreSQL offline (${dbStatus.postgres.error}). Run: docker compose up -d postgres`
    );
  }

  // 2. Check Ollama
  try {
    const tagRes = await fetch(`${baseUrl}/api/tags`);
    if (!tagRes.ok) throw new Error(`HTTP ${tagRes.status}`);
    const data = (await tagRes.json()) as { models?: Array<{ name?: string }> };
    const installed = (data.models ?? []).some(
      (m) => m.name === model || (m.name ?? "").startsWith(`${model}:`)
    );
    if (!installed) {
      console.log(`[WARN] Ollama reachable at ${baseUrl}, but '${model}' is not pulled. Run: ollama pull ${model}`);
      return;
    }
    console.log(`[OK] Ollama reachable at ${baseUrl} with model '${model}' installed.`);

    // 3. Run live NLU + Grounded NLG roundtrip
    console.log("Running live Ollama NLU extraction smoke test...");
    const nlu = await extractInquirySlots(
      "Tunataka quote ya Maasai Mara Classic kwa 10 people kuanzia 2026-12-15 with 15% discount.",
      "ollama"
    );
    console.log(`[OK] NLU source=${nlu.extractionSource} (${nlu.durationMs}ms)`, nlu.slots);

    console.log("Running live Ollama Grounded NLG smoke test...");
    const nlg = await synthesizeGroundedReply(
      {
        status: "confirmed",
        customer_name: "Demo Agency",
        language: "mixed",
        original_message: "Book Lake Nakuru for 2 adults starting 2026-12-20",
        fallback_template: "Confirmed Booking #99 — Lake Nakuru Flamingo & Rift Total: $1150.00.",
        booking_id: 99,
        circuit_name: "Lake Nakuru Flamingo & Rift",
        start_date: "2026-12-20",
        end_date: "2026-12-21",
        days: 2,
        total_pax: 2,
        vehicle_codes: ["OV-01"],
        guide_names: ["Peter Kamau"],
        quoted_total_usd: 1150,
        quoted_total_kes: 149557.5,
      },
      "ollama"
    );
    console.log(`[OK] NLG source=${nlg.responseSource} (${nlg.durationMs}ms) -> ${nlg.text}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[WARN] Ollama offline at ${baseUrl} (${msg}). Start Ollama and run: ollama pull ${model}`);
  } finally {
    await closePgPool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
