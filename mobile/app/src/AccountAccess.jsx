import React, { useState } from 'react';
import { Button, Text, View } from 'react-native';
import { Fields } from './Management';

const signupFields = {
  company: 'Organization name', pin: 'Organization KRA PIN', currency: 'Currency',
  first_name: 'First name', last_name: 'Last name', email: 'Email', phone_number: 'Phone number',
  username: 'Username', password: 'Password', confirmation: 'Confirm password',
};

export default function AccountAccess({ mode, api, submit, busy, styles, onBack, onRegistered }) {
  const [values, setValues] = useState({ currency: 'Ksh' });
  const [stage, setStage] = useState('choose');
  const [message, setMessage] = useState('');
  const [resetToken, setResetToken] = useState(null);

  function register() {
    return submit(async () => {
      const { company, pin, currency, confirmation, ...body } = values;
      if (!body.password || body.password !== confirmation) throw new Error('Enter matching passwords.');
      await api.publicRequest('auth/signup/', { body: {
        ...body, company_profile: { name: company, kra_pin: pin, currency, theme_color: '#10b981' },
      } });
      onRegistered(body.username);
    });
  }

  function sendEmail() {
    return submit(async () => {
      const result = await api.publicRequest('auth/password-reset/', { body: { email: values.email } });
      setMessage(result.detail);
    });
  }

  function sendCode() {
    return submit(async () => {
      const result = await api.publicRequest('auth/password-reset/phone/', { body: { phone_number: values.phone_number } });
      setMessage(result.detail);
      setStage('code');
    });
  }

  function verifyCode() {
    return submit(async () => {
      const result = await api.publicRequest('auth/password-reset/phone/verify/', {
        body: { phone_number: values.phone_number, code: values.code },
      });
      setResetToken(result.access);
      setStage('password');
      setMessage('');
    });
  }

  function resetPassword() {
    return submit(async () => {
      if (values.password !== values.confirmation) throw new Error('Enter matching passwords.');
      await api.publicRequest('accounts/me/', {
        token: resetToken, method: 'PATCH', body: { password: values.password },
      });
      setResetToken(null);
      setStage('done');
      setMessage('Password updated. Sign in with your new password.');
    });
  }

  const display = (fields) => <Fields {...{ fields, values, setValues, styles, busy }} />;
  return <View style={styles.group}>
    <Text style={styles.heading}>{mode === 'register' ? 'Set up an organization' : 'Reset password'}</Text>
    {mode === 'register' ? <>
      {display(signupFields)}
      <Button title="Create organization account" disabled={busy} onPress={register} />
    </> : <>
      {stage === 'choose' && <>
        <Button title="Use email" onPress={() => setStage('email')} disabled={busy} />
        <Button title="Use phone" onPress={() => setStage('phone')} disabled={busy} />
      </>}
      {stage === 'email' && <>
        {display({ email: 'Email' })}
        <Button title="Send reset link" disabled={busy || !values.email} onPress={sendEmail} />
      </>}
      {stage === 'phone' && <>
        {display({ phone_number: 'Phone number' })}
        <Button title="Send verification code" disabled={busy || !values.phone_number} onPress={sendCode} />
      </>}
      {stage === 'code' && <>
        {display({ code: 'Verification code' })}
        <Button title="Verify code" disabled={busy || !values.code} onPress={verifyCode} />
        <Button title="Resend code" disabled={busy} onPress={sendCode} />
      </>}
      {stage === 'password' && <>
        {display({ password: 'New password', confirmation: 'Confirm password' })}
        <Button title="Update password" disabled={busy || !values.password || !values.confirmation}
          onPress={resetPassword} />
      </>}
    </>}
    {!!message && <Text>{message}</Text>}
    <Button title="Back to sign in" disabled={busy} onPress={onBack} />
  </View>;
}
