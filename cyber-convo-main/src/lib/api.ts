export type ChatReply = { reply: string; session_id: string };
export type UploadedFile = { name: string; stored_name: string; url: string; content_type?: string; size?: number };

export interface StreamResponse {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  sessionId?: string;
}

export async function clearMemory(
  session_id?: string,
  apiKey?: string,
): Promise<ChatReply> {
  const res = await fetch(api('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '', session_id, clear: true, api_key: apiKey }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Clear memory failed with ${res.status}`);
  }
  return (await res.json()) as ChatReply;
}

export interface WebResult {
  title: string;
  url: string;
  content: string;
}

// Base URL for API calls in production. In development, Vite proxy maps 
// "/api" to the backend, but in production we call the backend directly.
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, '') || '';
const api = (path: string) => {
  // In development, calls go to "/api/..." and are proxied. In production, we
  // call the backend directly and must drop the "/api" prefix.
  if (API_BASE) return `${API_BASE}${path.replace(/^\/api/, '')}`;
  return path;
};

export async function webSearch(query: string, maxResults = 5): Promise<WebResult[]> {
  const res = await fetch(api('/api/websearch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_results: maxResults }),
  });
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  return (data?.results as WebResult[]) || [];
}

export async function sendChat(
  message: string,
  session_id?: string,
  system_prompt?: string,
  apiKey?: string,
): Promise<ChatReply> {
  const res = await fetch(api('/api/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, system_prompt, session_id, api_key: apiKey }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with ${res.status}`);
  }
  const data = await res.json();
  return data as ChatReply;
}

export async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await fetch(api('/api/upload'), { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Upload failed: ${res.status}`);
  }
  const data = await res.json();
  const uploaded: UploadedFile[] = ((data?.files || []) as UploadedFile[]).map((f) => {
    // Backend returns relative /uploads/...; prefix with API_BASE if provided
    if (API_BASE && f.url?.startsWith('/')) {
      return { ...f, url: `${API_BASE}${f.url}` };
    }
    return f;
  });
  return uploaded;
}

export async function streamChat(
  message: string,
  {
    session_id,
    system_prompt,
    apiKey,
    onChunk,
    signal,
    model,
  }: {
    session_id?: string;
    system_prompt?: string;
    apiKey?: string;
    onChunk?: (text: string) => void;
    signal?: AbortSignal;
    model?: string;
  }
): Promise<{ session_id?: string; text: string }> {
  const res = await fetch(api('/api/chat/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, system_prompt, session_id, api_key: apiKey, model }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Stream request failed with ${res.status}`);
  }

  const newSessionId = res.headers.get('x-session-id') || session_id || undefined;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      fullText += chunk;
      onChunk?.(chunk);
    }
  }

  return { session_id: newSessionId, text: fullText };
}

