function errorMessage(value) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' ? Object.values(value).map(errorMessage).find(Boolean) : undefined;
}

export function createApi(base, transport = fetch) {
  let access;
  let refresh;
  let pendingRefresh;
  let generation = 0;

  async function send(path, { token, organization, body, pdf, mime, form, method } = {}) {
    if (!base) throw new Error('Set the payroll API URL in src/config.js.');
    const headers = { Accept: pdf ? 'application/pdf, application/json' : 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (organization) headers['X-Organization-ID'] = String(organization);
    if (body) headers['Content-Type'] = 'application/json';
    const response = await transport(base.replace(/\/+$/, '') + '/' + path, {
      method: method || (body || form ? 'POST' : 'GET'),
      headers,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    if (response.ok && (pdf || mime)) {
      if (response.headers.get('Content-Type')?.split(';')[0] !== (mime || 'application/pdf')) {
        throw new Error('The payroll server did not return the requested document.');
      }
      return response;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(errorMessage(data?.detail ?? data) || 'Payroll request failed. Please try again.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function refreshAccess() {
    if (!pendingRefresh) {
      const currentGeneration = generation;
      pendingRefresh = send('token/refresh/', { body: { refresh } })
        .then((tokens) => {
          if (generation !== currentGeneration) throw new Error('Session changed.');
          access = tokens.access;
          refresh = tokens.refresh || refresh;
        })
        .finally(() => {
          if (generation === currentGeneration) pendingRefresh = undefined;
        });
    }
    return pendingRefresh;
  }

  return {
    publicRequest: send,
    get refreshToken() { return refresh; },
    restore(token) {
      generation += 1;
      access = undefined;
      refresh = token;
      pendingRefresh = undefined;
    },
    async signIn(username, password) {
      const tokens = await send('token/', { body: { username, password } });
      generation += 1;
      pendingRefresh = undefined;
      access = tokens.access;
      refresh = tokens.refresh;
    },
    async request(path, options) {
      const currentGeneration = generation;
      const previousAccess = access;
      try {
        return await send(path, { ...options, token: previousAccess });
      } catch (error) {
        if (error.status !== 401 || !refresh || generation !== currentGeneration) throw error;
        if (access === previousAccess) await refreshAccess();
        if (generation !== currentGeneration) throw new Error('Session changed.');
        return send(path, { ...options, token: access });
      }
    },
  };
}
