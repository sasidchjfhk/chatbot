import os
import re
import json
import threading
from typing import Dict, List, Any
import requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "z-ai/glm-4.5-air:free")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()

# Session and memory configuration
MAX_TURNS = int(os.getenv("MAX_TURNS", "25"))  # number of user-assistant exchanges to keep
PERSIST_SESSIONS = os.getenv("PERSIST_SESSIONS", "false").lower() in {"1", "true", "yes"}
SESSION_STORE_PATH = os.getenv("SESSION_STORE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "session_store.json"))

# Load default system prompt from file if available
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
SYSTEM_PROMPT_PATH = os.getenv("SYSTEM_PROMPT_PATH", os.path.join(PROJECT_ROOT, "system prompt"))
DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant."
try:
    if os.path.exists(SYSTEM_PROMPT_PATH):
        with open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
            DEFAULT_SYSTEM_PROMPT = f.read().strip() or DEFAULT_SYSTEM_PROMPT
            print(f"Loaded system prompt from: {SYSTEM_PROMPT_PATH}")
    else:
        print(f"System prompt file not found at: {SYSTEM_PROMPT_PATH}. Using default.")
except Exception as e:
    print(f"Failed to load system prompt from file: {e}. Using default.")

if not OPENROUTER_API_KEY:
    # We don't raise immediately to allow the server to start and return a 500 if missing on calls.
    print("WARNING: OPENROUTER_API_KEY not set in environment. Set it in .env as OPENROUTER_API_KEY=<your_key>.")

app = FastAPI(title="Chatbot Backend", version="1.0.0")

# Allow Vite dev server and local clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://[::1]:8081",
        "*"  # You may restrict this in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads (mounted after app and PROJECT_ROOT are defined)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

class ChatRequest(BaseModel):
    message: str
    system_prompt: str | None = None
    session_id: str | None = None
    clear: bool | None = None
    # Optional per-request OpenRouter API key provided by the client.
    # If omitted, the server will fall back to the environment variable.
    api_key: str | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


@app.get("/health")
def health():
    return {"status": "ok"}


# ----------------------------
# In-memory session store
# ----------------------------
_SESSION_LOCK = threading.Lock()
_SESSIONS: Dict[str, List[Dict[str, Any]]] = {}


def _load_sessions_from_disk() -> None:
    if not PERSIST_SESSIONS:
        return
    try:
        if os.path.exists(SESSION_STORE_PATH):
            with open(SESSION_STORE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    with _SESSION_LOCK:
                        # ensure correct shape
                        for k, v in data.items():
                            if isinstance(v, list):
                                _SESSIONS[k] = [m for m in v if isinstance(m, dict) and "role" in m and "content" in m]
            print(f"Loaded sessions from {SESSION_STORE_PATH} ({len(_SESSIONS)} sessions)")
    except Exception as e:
        print(f"Failed to load sessions: {e}")


def _persist_sessions_to_disk() -> None:
    if not PERSIST_SESSIONS:
        return
    try:
        with _SESSION_LOCK:
            with open(SESSION_STORE_PATH, "w", encoding="utf-8") as f:
                json.dump(_SESSIONS, f)
    except Exception as e:
        print(f"Failed to persist sessions: {e}")


_load_sessions_from_disk()


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # Prefer request-provided key, fall back to environment.
    request_api_key = (req.api_key or "").strip()
    effective_api_key = request_api_key or OPENROUTER_API_KEY
    if not effective_api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key is required. Provide it in the request (api_key) or set OPENROUTER_API_KEY on the server.")

    system_prompt = req.system_prompt or DEFAULT_SYSTEM_PROMPT

    # Determine session id (allow client-provided or generate deterministic per-process)
    session_id = req.session_id or os.urandom(8).hex()

    # Clear session on demand
    if req.clear:
        with _SESSION_LOCK:
            _SESSIONS.pop(session_id, None)
            _persist_sessions_to_disk()

    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {effective_api_key}",
        "Content-Type": "application/json",
    }
    # Build conversation from history
    with _SESSION_LOCK:
        history = _SESSIONS.get(session_id, []).copy()
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": req.message},
    ]
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
    }

    try:
        r = requests.post(url, headers=headers, json=payload, timeout=60)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        data = r.json()
        reply = data.get("choices", [{}])[0].get("message", {}).get("content")
        if not reply:
            raise HTTPException(status_code=502, detail="No reply from model")
        # Update history (keep last MAX_TURNS exchanges)
        with _SESSION_LOCK:
            hist = _SESSIONS.get(session_id, [])
            hist.append({"role": "user", "content": req.message})
            hist.append({"role": "assistant", "content": reply})
            # Trim to last exchanges (2 messages per turn)
            max_messages = MAX_TURNS * 2
            if len(hist) > max_messages:
                hist = hist[-max_messages:]
            _SESSIONS[session_id] = hist
            _persist_sessions_to_disk()
        return ChatResponse(reply=reply, session_id=session_id)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    """Accept multiple file uploads and return their public URLs under /uploads.
    Intended for images and documents. Files are saved with a random prefix to avoid collisions.
    """
    saved = []
    for f in files:
        # Sanitize filename
        name = os.path.basename(f.filename or "file")
        prefix = os.urandom(4).hex()
        out_name = f"{prefix}_{name}"
        out_path = os.path.join(UPLOAD_DIR, out_name)
        try:
            with open(out_path, "wb") as out:
                content = await f.read()
                out.write(content)
            saved.append({
                "name": name,
                "stored_name": out_name,
                "url": f"/uploads/{out_name}",
                "content_type": f.content_type,
                "size": len(content),
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save {name}: {e}")
    return {"files": saved}


@app.post("/chat/stream")
def chat_stream(req: ChatRequest):
    """Stream assistant response tokens progressively, ChatGPT-style.
    The response body is a text stream (chunked). A header 'x-session-id' is set.
    """
    # Prefer request-provided key, fall back to environment.
    request_api_key = (req.api_key or "").strip()
    effective_api_key = request_api_key or OPENROUTER_API_KEY
    if not effective_api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key is required. Provide it in the request (api_key) or set OPENROUTER_API_KEY on the server.")

    system_prompt = req.system_prompt or DEFAULT_SYSTEM_PROMPT
    session_id = req.session_id or os.urandom(8).hex()

    # Build conversation from history
    with _SESSION_LOCK:
        history = _SESSIONS.get(session_id, []).copy()
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": req.message},
    ]

    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {effective_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "stream": True,
    }

    def event_generator():
        reply_accum = []
        try:
            with requests.post(url, headers=headers, json=payload, stream=True, timeout=300) as resp:
                if resp.status_code != 200:
                    # Yield error and stop
                    yield f"[ERROR] {resp.text}"
                    return
                for line in resp.iter_lines(decode_unicode=True):
                    if not line:
                        continue
                    # OpenRouter streams Server-Sent Events lines starting with 'data: '
                    if line.startswith("data: "):
                        data_str = line[len("data: "):].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            obj = json.loads(data_str)
                            delta = obj.get("choices", [{}])[0].get("delta", {})
                            chunk = delta.get("content")
                            if chunk:
                                reply_accum.append(chunk)
                                yield chunk
                        except Exception:
                            # If not JSON (rare), just forward text
                            yield data_str
        finally:
            # Persist history after stream completes
            full_reply = "".join(reply_accum).strip()
            if full_reply:
                with _SESSION_LOCK:
                    hist = _SESSIONS.get(session_id, [])
                    hist.append({"role": "user", "content": req.message})
                    hist.append({"role": "assistant", "content": full_reply})
                    max_messages = MAX_TURNS * 2
                    if len(hist) > max_messages:
                        hist = hist[-max_messages:]
                    _SESSIONS[session_id] = hist
                    _persist_sessions_to_disk()

    return StreamingResponse(event_generator(), media_type="text/plain", headers={"x-session-id": session_id})


def _strip_html(text: str) -> str:
    # very simple tag stripper
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


@app.post("/websearch")
def websearch(payload: dict):
    """
    Body: { "query": str, "max_results": int=5 }
    Uses Tavily if TAVILY_API_KEY is present; otherwise, falls back to DuckDuckGo.
    Returns: { results: [ { title, url, content } ] }
    """
    query = (payload.get("query") or "").strip()
    max_results = int(payload.get("max_results") or 5)
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    results = []

    if TAVILY_API_KEY:
        try:
            tavily_url = "https://api.tavily.com/search"
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {TAVILY_API_KEY}"}
            data = {
                "query": query,
                "search_depth": "basic",
                "max_results": max_results,
                "include_answer": False,
                "include_images": False,
                "include_domains": [],
            }
            r = requests.post(tavily_url, headers=headers, json=data, timeout=30)
            if r.status_code == 200:
                jr = r.json()
                for item in jr.get("results", [])[:max_results]:
                    results.append({
                        "title": item.get("title") or item.get("url") or "",
                        "url": item.get("url") or "",
                        "content": (item.get("content") or "").strip(),
                    })
        except Exception:
            pass

    # Fallback to DuckDuckGo Lite HTML if no results yet
    if not results:
        try:
            q = requests.utils.quote(query)
            url = f"https://duckduckgo.com/html/?q={q}"
            r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                # crude parse for results
                links = re.findall(r'<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', r.text, flags=re.I)
                for href, title_html in links[:max_results]:
                    title = _strip_html(title_html)
                    content = ""
                    try:
                        pr = requests.get(href, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
                        if pr.status_code == 200:
                            content = _strip_html(pr.text)[:2000]
                    except Exception:
                        pass
                    results.append({"title": title, "url": href, "content": content})
        except Exception:
            pass

    return JSONResponse({"results": results[:max_results]})


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
