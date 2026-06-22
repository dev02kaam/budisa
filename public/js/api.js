async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error de red');
  }

  return payload.data;
}

window.requestJson = requestJson;
