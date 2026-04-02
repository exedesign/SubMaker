// IPC routing disabled — Electron uses the same browser fetch/XHR as Chrome.
// This keeps the Electron and web versions identical, avoiding behavioural
// differences that could destabilise the renderer process.
const hasElectronTransport = () => false;

function normalizeBody(body, headers) {
  if (body === undefined || body === null) {
    return { body: undefined, headers };
  }

  if (typeof body === 'string' || body instanceof FormData) {
    return { body, headers };
  }

  const nextHeaders = { 'Content-Type': 'application/json', ...(headers || {}) };
  return { body: JSON.stringify(body), headers: nextHeaders };
}

/**
 * Convert a FormData object into a serialisable array of parts that can
 * travel over Electron IPC.  Blob/File values are read into base64 strings;
 * plain strings are kept as-is.
 */
async function serialiseFormData(formData) {
  const parts = [];
  for (const [name, value] of formData.entries()) {
    if (value instanceof Blob) {
      const buf = await value.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      // Process in chunks to avoid call-stack overflow on large blobs
      const CHUNK = 32768;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      parts.push({
        name,
        type: 'blob',
        data: btoa(binary),
        filename: value.name || name,
        mime: value.type || 'application/octet-stream',
      });
    } else {
      parts.push({ name, type: 'string', data: String(value) });
    }
  }
  return parts;
}

function parseErrorPayload(status, payload) {
  if (payload && typeof payload === 'object') {
    const error = payload.error || payload.message;
    if (error) {
      const err = new Error(error);
      err.status = status;
      err.payload = payload;
      return err;
    }
  }

  const err = new Error(`Request failed with status ${status}`);
  err.status = status;
  err.payload = payload;
  return err;
}

async function parseFetchPayload(response, responseType) {
  if (responseType === 'arraybuffer') {
    return response.arrayBuffer();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function fetchJson(url, options = {}) {
  const { method = 'GET', headers = {}, body } = options;

  if (hasElectronTransport()) {
    const response = await window.electronAPI.fetchViaMain({
      url,
      method,
      headers,
      body,
    });

    if (response.status < 200 || response.status >= 300) {
      throw parseErrorPayload(response.status, response.data);
    }

    return response.data;
  }

  const normalized = normalizeBody(body, headers);
  const response = await fetch(url, {
    method,
    headers: normalized.headers,
    body: normalized.body,
  });
  const data = await parseFetchPayload(response, 'json');

  if (!response.ok) {
    throw parseErrorPayload(response.status, data);
  }

  return data;
}

export async function fetchArrayBuffer(url, options = {}) {
  const { method = 'GET', headers = {}, body } = options;

  if (hasElectronTransport()) {
    const response = await window.electronAPI.fetchViaMain({
      url,
      method,
      headers,
      body,
      responseType: 'arraybuffer',
    });

    if (response.status < 200 || response.status >= 300) {
      throw parseErrorPayload(response.status, response.data);
    }

    const bytes = Uint8Array.from(atob(response.data), (char) => char.charCodeAt(0));
    return bytes.buffer;
  }

  const normalized = normalizeBody(body, headers);
  const response = await fetch(url, {
    method,
    headers: normalized.headers,
    body: normalized.body,
  });

  if (!response.ok) {
    const data = await parseFetchPayload(response, 'json');
    throw parseErrorPayload(response.status, data);
  }

  return response.arrayBuffer();
}

export async function streamJsonEvents(url, body, onEvent) {
  if (window.electronAPI?.streamViaMain) {
    return window.electronAPI.streamViaMain({ url, body }, onEvent);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await parseFetchPayload(response, 'json');
    throw parseErrorPayload(response.status, payload);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const payload = JSON.parse(line.slice(6));
        onEvent(payload);
      } catch {
        // ignore malformed SSE payloads
      }
    }
  }

  if (buffer.trim().startsWith('data: ')) {
    try {
      const payload = JSON.parse(buffer.trim().slice(6));
      onEvent(payload);
    } catch {
      // ignore malformed trailing payloads
    }
  }

  return { ok: true };
}

/**
 * Upload FormData through Electron IPC (Node.js HTTP) instead of Chromium fetch.
 * Falls back to native fetch() in browser mode.
 */
export async function fetchFormData(url, formData) {
  if (hasElectronTransport()) {
    const parts = await serialiseFormData(formData);
    const response = await window.electronAPI.fetchViaMain({
      url,
      method: 'POST',
      formDataParts: parts,
    });

    if (response.status < 200 || response.status >= 300) {
      throw parseErrorPayload(response.status, response.data);
    }

    return response.data;
  }

  // Browser fallback — plain fetch
  const response = await fetch(url, { method: 'POST', body: formData });
  const data = await parseFetchPayload(response, 'json');
  if (!response.ok) {
    throw parseErrorPayload(response.status, data);
  }
  return data;
}