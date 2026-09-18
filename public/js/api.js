(() => {
  let csrfToken = '';
  let unauthorizedHandler = null;

  function setCsrfToken(value = '') {
    csrfToken = String(value || '');
  }

  function setUnauthorizedHandler(handler) {
    unauthorizedHandler = typeof handler === 'function' ? handler : null;
  }

  async function requestData(url, options = {}, binary = false) {
    const { notifyUnauthorized = true, headers: optionHeaders = {}, ...fetchOptions } = options;
    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const headers = { ...optionHeaders };

    if (fetchOptions.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
      headers['X-Budisa-CSRF'] = csrfToken;
    }

    const response = await fetch(url, {
      credentials: 'same-origin',
      ...fetchOptions,
      headers
    });
    if (binary && response.ok && response.headers.get('Content-Type')?.includes('application/pdf')) return response.blob();
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || 'No se ha podido completar la operación.');
      error.status = response.status;
      error.code = payload.code || '';
      if (response.status === 401 && notifyUnauthorized && url !== '/auth/login') {
        unauthorizedHandler?.(error);
      }
      throw error;
    }

    if (binary) throw new Error('El servidor no ha devuelto un PDF válido. Vuelve a intentarlo.');
    return payload.data;
  }

  const requestJson = (url, options) => requestData(url, options);
  const requestBlob = (url, options) => requestData(url, options, true);

  window.apiClient = { requestJson, requestBlob, setCsrfToken, setUnauthorizedHandler };
  window.requestJson = requestJson;
})();
