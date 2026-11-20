import "dotenv/config";
import { execFileSync, spawn, spawnSync } from "node:child_process";

const BASE_URL = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL ?? "qwen3:4b";

async function isOllamaReachable(): Promise<{ reachable: boolean; models: string[] }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, models: [] };
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    return {
      reachable: true,
      models: (data.models ?? []).map((m) => m.name ?? ""),
    };
  } catch {
    return { reachable: false, models: [] };
  }
}

function hasOllamaCli(): boolean {
  const probe = spawnSync("ollama", ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

async function ensureOllama() {
  console.log(`[Ollama Requirement Check] Target: ${BASE_URL} | Model: ${MODEL}`);

  let status = await isOllamaReachable();
  if (!status.reachable) {
    if (!hasOllamaCli()) {
      console.error(
        `[ERROR] 'ollama' CLI is not installed or not on PATH.\n` +
          `Install Ollama from https://ollama.com, then run:\n` +
          `  ollama pull ${MODEL}\n` +
          `  ollama serve`
      );
      process.exit(1);
    }

    console.log("[Ollama] Server not running. Starting 'ollama serve' in background...");
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      status = await isOllamaReachable();
      if (status.reachable) break;
    }

    if (!status.reachable) {
      console.error(
        `[ERROR] Timed out waiting for 'ollama serve' at ${BASE_URL}.\n` +
          `Start it manually in a terminal:\n  ollama serve`
      );
      process.exit(1);
    }
  }

  console.log(`[OK] Ollama server reachable at ${BASE_URL}.`);

  const hasModel = status.models.some((m) => m === MODEL || m.startsWith(`${MODEL}:`));
  if (!hasModel) {
    if (!hasOllamaCli()) {
      console.error(`[ERROR] Model '${MODEL}' not found on ${BASE_URL}. Run: ollama pull ${MODEL}`);
      process.exit(1);
    }
    console.log(`[Ollama] Model '${MODEL}' not found locally. Running: ollama pull ${MODEL} ...`);
    execFileSync("ollama", ["pull", MODEL], { stdio: "inherit" });
  }

  console.log(`[OK] Required Ollama model '${MODEL}' is ready.`);
}

ensureOllama().catch((err) => {
  console.error("[ERROR] Ollama setup check failed:", err);
  process.exit(1);
});
