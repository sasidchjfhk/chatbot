import os
import re
import json
import threading
from typing import Dict, List, Any
import requests
import time
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-chat-v3.1:free")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()

# Session and memory configuration
# Lower default MAX_TURNS to reduce prompt size for faster responses; configurable via env.
MAX_TURNS = int(os.getenv("MAX_TURNS", "10"))  # number of user-assistant exchanges to keep
# Additionally cap the total characters included from history to avoid very large prompts.
MAX_PROMPT_CHARS = int(os.getenv("MAX_PROMPT_CHARS", "6000"))
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

# Optional: ask model to include a brief reasoning summary block (not chain-of-thought)
SHOW_THINKING_SUMMARY = os.getenv("SHOW_THINKING_SUMMARY", "false").lower() in {"1", "true", "yes"}
REASONING_GUIDE = (
    "\n\nWhen responding, first include a short fenced code block labelled 'reasoning' with 2-5 concise bullet points summarizing your approach (no chain-of-thought, no confidential info). After that block, provide the final answer. Example:\n\n```reasoning\n- Identify the key requirement\n- Outline a brief approach\n- Mention any assumptions\n```\n\nThen the final answer follows."
)

if not OPENROUTER_API_KEY:
    # We don't raise immediately to allow the server to start and return a 500 if missing on calls.
    print("WARNING: OPENROUTER_API_KEY not set in environment. Set it in .env as OPENROUTER_API_KEY=<your_key>.")

app = FastAPI(title="Chatbot Backend", version="1.0.0")

# Allow Vite dev server and local clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://[::1]:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://[::1]:8081",
        "*"  # You may restrict this in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-session-id", "content-type"],
)

# Static files for uploads (mounted after app and PROJECT_ROOT are defined)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

class ChatRequest(BaseModel):
    message: str
    system_prompt: str | None = None
    session_id: str | None = None
    clear: bool | None = None
    model: str | None = None
    temperature: float | None = None
    # Per-request toggle to show a short visible reasoning summary block (```reasoning)
    show_thinking_summary: bool | None = None
    # Optional per-request OpenRouter API key provided by the client.
    # If omitted, the server will fall back to the environment variable.
    api_key: str | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


@app.get("/health")
def health():
    return {"status": "ok"}


# Minimal root route to avoid 404 at '/'
@app.get("/")
def root():
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


def _build_messages(system_prompt: str, history: List[Dict[str, Any]], user_message: str) -> List[Dict[str, str]]:
    """Build messages with limits to keep prompts fast.
    Applies both MAX_TURNS (last N exchanges) and MAX_PROMPT_CHARS (approx cap by char count).
    """
    # First, apply turns cap (2 messages per turn)
    max_messages = MAX_TURNS * 2
    trimmed_hist = history[-max_messages:] if max_messages > 0 else history

    # Then, apply character budget from the end (most recent first)
    budget = max(1000, MAX_PROMPT_CHARS)  # never below 1000 chars
    accum: List[Dict[str, str]] = []
    total = 0
    for msg in reversed(trimmed_hist):
        content = str(msg.get("content", ""))
        # Always include at least a small piece of the last few messages
        if total + len(content) > budget and len(accum) > 0:
            break
        accum.append({"role": msg.get("role", "user"), "content": content})
        total += len(content)
    accum.reverse()

    messages = [
        {"role": "system", "content": system_prompt},
        *accum,
        {"role": "user", "content": user_message},
    ]
    return messages


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # Prefer request-provided key, fall back to environment.
    request_api_key = (req.api_key or "").strip()
    effective_api_key = request_api_key or OPENROUTER_API_KEY
    if not effective_api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key is required. Provide it in the request (api_key) or set OPENROUTER_API_KEY on the server.")

    system_prompt = req.system_prompt or DEFAULT_SYSTEM_PROMPT
    want_summary = req.show_thinking_summary if req.show_thinking_summary is not None else SHOW_THINKING_SUMMARY
    if want_summary:
        system_prompt = (system_prompt + REASONING_GUIDE).strip()

    # Determine session id (allow client-provided or generate deterministic per-process)
    session_id = req.session_id or os.urandom(8).hex()

    # Allow pure clear without invoking the model when message is empty
    if req.clear and not (req.message or "").strip():
        with _SESSION_LOCK:
            _SESSIONS.pop(session_id, None)
            _persist_sessions_to_disk()
        def _gen():
            yield "Memory cleared."
        return StreamingResponse(_gen(), media_type="text/plain", headers={"x-session-id": session_id})

    # Clear session on demand
    if req.clear:
        with _SESSION_LOCK:
            _SESSIONS.pop(session_id, None)
            _persist_sessions_to_disk()
        # If this is a pure clear action (no message), return immediately without calling the model
        if not (req.message or "").strip():
            return ChatResponse(reply="Memory cleared.", session_id=session_id)

    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {effective_api_key}",
        "Content-Type": "application/json",
    }
    # Build conversation from history (trimmed for speed)
    with _SESSION_LOCK:
        history = _SESSIONS.get(session_id, []).copy()
    messages = _build_messages(system_prompt, history, req.message)
    payload = {
        "model": (req.model or OPENROUTER_MODEL),
        "messages": messages,
        # Encourage higher reasoning effort on models that support it (ignored otherwise)
        "reasoning": {"effort": "high"},
    }
    if req.temperature is not None:
        try:
            payload["temperature"] = float(req.temperature)
        except Exception:
            pass

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
    Enforces simple size and content-type checks configurable via env.
    """
    # Upload constraints (configurable via env)
    try:
        max_mb = max(1, int(os.getenv("MAX_UPLOAD_SIZE_MB", "10")))
    except Exception:
        max_mb = 10
    MAX_BYTES = max_mb * 1024 * 1024
    allowed_types_env = os.getenv(
        "ALLOWED_UPLOAD_TYPES",
        # common images and office/pdf/plain text
        "image/jpeg,image/png,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
    )
    ALLOWED_TYPES = {t.strip().lower() for t in allowed_types_env.split(",") if t.strip()}

    saved = []
    for f in files:
        # Sanitize filename
        name = os.path.basename(f.filename or "file")
        prefix = os.urandom(4).hex()
        out_name = f"{prefix}_{name}"
        out_path = os.path.join(UPLOAD_DIR, out_name)
        try:
            content = await f.read()
            size = len(content)
            ctype = (f.content_type or "").lower().strip()

            if size > MAX_BYTES:
                raise HTTPException(status_code=413, detail=f"{name}: file too large ({size} bytes). Max {max_mb} MB")

            # If a type is provided, ensure it's allowed (skip check if backend cannot detect type)
            if ctype and ALLOWED_TYPES and ctype not in ALLOWED_TYPES:
                raise HTTPException(status_code=415, detail=f"{name}: content-type '{ctype}' not allowed")

            with open(out_path, "wb") as out:
                out.write(content)
            saved.append({
                "name": name,
                "stored_name": out_name,
                "url": f"/uploads/{out_name}",
                "content_type": f.content_type,
                "size": size,
            })
        except HTTPException:
            # propagate specific errors
            raise
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
    if SHOW_THINKING_SUMMARY:
        system_prompt = (system_prompt + REASONING_GUIDE).strip()
    session_id = req.session_id or os.urandom(8).hex()

    # Build conversation from history (trimmed for speed)
    with _SESSION_LOCK:
        history = _SESSIONS.get(session_id, []).copy()
    messages = _build_messages(system_prompt, history, req.message)

    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {effective_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": (req.model or OPENROUTER_MODEL),
        "messages": messages,
        "stream": True,
        # Encourage higher reasoning effort on models that support it (ignored otherwise)
        "reasoning": {"effort": "high"},
    }
    if req.temperature is not None:
        try:
            payload["temperature"] = float(req.temperature)
        except Exception:
            pass

    def event_generator():
        reply_accum = []
        try:
            # Basic retry loop for connection setup issues (e.g., DNS)
            last_err: Exception | None = None
            for attempt in range(1, 4):
                try:
                    with requests.post(url, headers=headers, json=payload, stream=True, timeout=300) as resp:
                        if resp.status_code != 200:
                            yield f"[ERROR] Upstream error {resp.status_code}: {resp.text}"
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
                        # If we reached here without exception, break out of retry loop
                        last_err = None
                        break
                except requests.RequestException as e:
                    last_err = e
                    # Exponential backoff before retrying
                    if attempt < 3:
                        time.sleep(0.6 * (2 ** (attempt - 1)))
                    else:
                        # On final failure, emit a friendly error to the client
                        msg = str(e)
                        if 'getaddrinfo failed' in msg or 'NameResolutionError' in msg:
                            yield "[ERROR] Cannot resolve OpenRouter host. Check your internet/DNS or OPENROUTER_BASE_URL."
                        else:
                            yield f"[ERROR] Network error: {msg}"
                        return
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
