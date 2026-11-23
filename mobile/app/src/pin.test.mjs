import assert from 'node:assert/strict';
import test from 'node:test';
import { isPin, checkPin } from './pin.mjs';

test('accepts exactly four digits and preserves leading zeros', () => {
  assert.equal(isPin('0123'), true);
  for (const value of ['123', '12345', 'abcd', '12 3', '1234\n']) {
    assert.equal(isPin(value), false);
  }
});

test('requires the account password after five wrong PINs', () => {
  let credential = { pin: '0123', token: 'refresh', failures: 0 };
  for (let failures = 1; failures < 5; failures += 1) {
    const result = checkPin(credential, '9999');
    assert.equal(result.unlocked, false);
    credential = result.credential;
    assert.equal(credential.failures, failures);
  }
  assert.deepEqual(checkPin(credential, '9999'), { unlocked: false, credential: null });
  assert.deepEqual(checkPin(credential, '0123'), {
    unlocked: true,
    credential: { pin: '0123', token: 'refresh', failures: 0 },
  });
});
