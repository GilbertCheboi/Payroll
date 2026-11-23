export function isPin(value) {
  return typeof value === 'string' && value.length === 4 && /^[0-9]+$/.test(value);
}

export function checkPin(credential, pin) {
  if (credential.pin === pin) {
    return { unlocked: true, credential: { ...credential, failures: 0 } };
  }

  const failures = credential.failures + 1;
  return {
    unlocked: false,
    credential: failures >= 5 ? null : { ...credential, failures },
  };
}
