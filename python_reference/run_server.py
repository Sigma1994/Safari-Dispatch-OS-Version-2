import json
import os
import urllib.request
from dotenv import load_dotenv
import uvicorn
from src.db import init_db


def _check_ollama_startup() -> None:
    if os.getenv("USE_DETERMINISTIC_LLM", "0").strip().lower() in {"1", "true", "yes"}:
        return
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "qwen3:4b")
    try:
        with urllib.request.urlopen(f"{base_url}/api/tags", timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name", "") for m in data.get("models", [])]
            if any(m == model or m.startswith(f"{model}:") for m in models):
                print(f"[LLM] Local Ollama ready at {base_url} (model: {model})")
            else:
                print(f"[LLM] Ollama reachable at {base_url}, but '{model}' is missing. Run: ollama pull {model}")
    except Exception:
        print(
            f"[LLM] Ollama not detected at {base_url}. Required commands:\n"
            f"      ollama pull {model}\n"
            f"      ollama serve\n"
            "      (Using deterministic fallback automatically until Ollama is running.)"
        )


if __name__ == "__main__":
    load_dotenv()
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("USE_DETERMINISTIC_LLM", "0")
    init_db()
    _check_ollama_startup()
    uvicorn.run("src.api:app", host="127.0.0.1", port=8000, reload=True)
