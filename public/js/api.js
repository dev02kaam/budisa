(() => {
  let csrfToken = '';
  let unauthorizedHandler = null;

  function setCsrfToken(value = '') {
    csrfToken = String(value || '');
  }

  function setUnauthorizedHandler(handler) {
    unauthorizedHandler = typeof handler === 'function' ? handler : null;
  }

  async function requestJson(url, options = {}) {
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

    return payload.data;
  }

  window.apiClient = { requestJson, setCsrfToken, setUnauthorizedHandler };
  window.requestJson = requestJson;
})();
