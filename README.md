# Safari Dispatch OS

Full-stack Kenyan safari quoting, fleet/guide dispatch, and human-in-the-loop (HITL) approval system powered by a neuro-symbolic pipeline: **Local Ollama (`qwen3:4b`)** for English/Swahili NLU extraction and grounded NLG replies, plus deterministic SQLite/PostgreSQL pricing, vehicle/guide allocation, and atomic TOCTOU booking locks.

---

## Requirements

1. **Ollama (Required for Default Local AI Engine)**
   - Install Ollama ([ollama.com](https://ollama.com)) and start + pull the default model before running locally:
     ```bash
     ollama pull qwen3:4b
     ollama serve
     ```
   - Both the Node/React server (`server.ts`) and the Python FastAPI reference (`python_reference/run_server.py`) connect to `http://localhost:11434` using `qwen3:4b` **by default** with zero `.env` changes required.
   - If Ollama is temporarily offline, workflows automatically degrade to deterministic regex/template fallbacks so the app stays operational.

2. **Node.js 22+** (uses built-in `node:sqlite`) and `npm`

3. **Python 3.11+** (only if running `python_reference/` in PyCharm)

4. **Docker Desktop** *(optional)* — for PostgreSQL 16 (`docker compose up -d postgres`). Falls back automatically to local SQLite (`data/safari_dispatch.db`, auto-created from `data/schema.sql` and `data/seed.sql`) if PostgreSQL is offline.

---

## Quick Start (After `git clone` / PyCharm Pull)

### 1. Ensure Required Ollama Model & Server Are Running
```bash
ollama pull qwen3:4b
ollama serve
```
Or run the included helper script after `npm install` (starts `ollama serve` if needed and pulls `qwen3:4b`):
```bash
npm run ollama:setup
```

### 2. Run the Full-Stack App (React + Express on Port 3000)
```bash
npm install
npm run dev
```
Useful scripts:
- `npm run dev:ollama` — verifies/starts `ollama serve` + pulls `qwen3:4b`, then starts `npm run dev`
- `npm run check:local` — checks PostgreSQL, `ollama serve`, and runs a live `qwen3:4b` NLU + NLG smoke test
- `npm test` — runs all automated pricing, concurrency, HITL, and schema checks

### 3. Run the Python FastAPI + LangGraph Reference (PyCharm)
PyCharm automatically detects `python_reference/requirements.txt`:
```bash
pip install -r python_reference/requirements.txt
python python_reference/run_server.py
```
This starts FastAPI on `http://127.0.0.1:8000` with `USE_DETERMINISTIC_LLM=0` (Local Ollama `qwen3:4b` enabled by default).
