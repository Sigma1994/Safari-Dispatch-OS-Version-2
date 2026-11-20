import os
from dotenv import load_dotenv
import uvicorn
from src.db import init_db

if __name__ == "__main__":
    load_dotenv()
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("USE_DETERMINISTIC_LLM", "1")
    init_db()
    uvicorn.run("src.api:app", host="127.0.0.1", port=8000, reload=True)
