const hasElectronTransport = () => !!window.electronAPI?.fetchViaMain;

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