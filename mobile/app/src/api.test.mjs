import assert from 'node:assert/strict';
import test from 'node:test';
import { createApi } from './api.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('uses existing login contract and routes requests through the selected organization', async () => {
  const calls = [];
  const api = createApi('https://payroll.example/api/', async (url, options) => {
    calls.push([url, options]);
    return json(calls.length === 1 ? { access: 'access', refresh: 'refresh' } : { id: 1 });
  });
  await api.signIn('0712345678', 'password');
  await api.request('accounts/me/', { organization: 5 });
  assert.deepEqual(JSON.parse(calls[0][1].body), { username: '0712345678', password: 'password' });
  assert.equal(calls[0][0], 'https://payroll.example/api/token/');
  assert.equal(calls[1][1].headers.Authorization, 'Bearer access');
  assert.equal(calls[1][1].headers['X-Organization-ID'], '5');
});

test('refreshes an expired access token and retries the same request once', async () => {
  const calls = [];
  const api = createApi('https://payroll.example/api', async (url, options) => {
    calls.push([url, options]);
    if (calls.length === 1) return json({}, 401);
    if (calls.length === 2) return json({ access: 'fresh', refresh: 'rotated' });
    return json({ id: 1 });
  });
  api.restore('original');
  assert.deepEqual(await api.request('accounts/me/'), { id: 1 });
  assert.equal(calls[1][0], 'https://payroll.example/api/token/refresh/');
  assert.equal(calls[2][1].headers.Authorization, 'Bearer fresh');
  assert.equal(api.refreshToken, 'rotated');
});

test('returns the PDF body after authenticated download', async () => {
  const api = createApi('https://payroll.example/api', async (url, options) => {
    if (url.endsWith('/token/')) return json({ access: 'access', refresh: 'refresh' });
    assert.equal(options.headers.Authorization, 'Bearer access');
    assert.equal(options.headers.Accept, 'application/pdf, application/json');
    return new Response('%PDF-sample', { headers: { 'Content-Type': 'application/pdf' } });
  });
  await api.signIn('employee', 'password');
  const document = await api.request('payroll-records/1/payslip/', { pdf: true });
  assert.equal(await document.text(), '%PDF-sample');
});
