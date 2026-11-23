import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Button, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Keychain from 'react-native-keychain';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createApi } from './api.mjs';
import { payrollApiUrl } from './config';
import { checkPin, isPin } from './pin.mjs';
import Attendance from './Attendance';
import AccountAccess from './AccountAccess';
import Expenses from './Expenses';
import Leave from './Leave';
import WorkSites from './WorkSites';
import { shareDocument } from './nativeTools';
import { Billing, Profile, Records, Reports } from './Management';

const service = 'com.agrieldo.payroll.session';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <PayrollApp />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function PayrollApp() {
  const api = useRef(createApi(payrollApiUrl)).current;
  const credential = useRef(null);
  const submitting = useRef(false);
  const [mode, setMode] = useState('password');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [page, setPage] = useState('home');
  const [organization, setOrganization] = useState(null);
  const [profile, setProfile] = useState(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState(null);
  const [foreground, setForeground] = useState(!AppState.currentState || AppState.currentState === 'active');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  async function storeCredential(next) {
    if (next) {
      const saved = await Keychain.setGenericPassword('payroll', JSON.stringify(next), { service });
      if (!saved) throw new Error('The phone could not save the PIN securely.');
    } else {
      await Keychain.resetGenericPassword({ service });
    }
    credential.current = next;
  }

  async function saveSession() {
    if (credential.current && credential.current.token !== api.refreshToken) {
      await storeCredential({ ...credential.current, token: api.refreshToken });
    }
  }

  function clearScreen(nextMode) {
    api.restore();
    setProfile(null);
    setPage('home');
    setOrganization(null);
    setRecords(null);
    setSummary(null);
    setPin('');
    setConfirmation('');
    setMode(nextMode);
  }

  async function submit(action) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function signOut() {
    return submit(async () => {
      await storeCredential(null);
      clearScreen('password');
    });
  }

  useEffect(() => {
    async function readCredential() {
      try {
        const saved = await Keychain.getGenericPassword({ service });
        if (saved) {
          let stored;
          try {
            stored = JSON.parse(saved.password);
          } catch {
            // Earlier builds stored only the refresh token.
          }
          if (isPin(stored?.pin) && typeof stored.token === 'string' &&
              Number.isInteger(stored.failures) && stored.failures >= 0 && stored.failures < 5) {
            credential.current = stored;
            setMode('unlock');
          } else {
            await storeCredential(null);
          }
        }
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(false);
      }
    }
    readCredential();
  }, []);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state === 'background' && mode === 'dashboard' && !submitting.current) {
        clearScreen('unlock');
        setError('');
      }
    });
    return () => listener.remove();
  }, [mode]);

  function signIn() {
    return submit(async () => {
      await api.signIn(username.trim(), password);
      setPassword('');
      const account = await api.request('accounts/me/');
      setProfile(account);
      setMode('setup');
    });
  }

  function setUpPin() {
    return submit(async () => {
      if (!isPin(pin) || pin !== confirmation) throw new Error('Enter the same four digits in both fields.');
      await storeCredential({ pin, token: api.refreshToken, failures: 0 });
      setPin('');
      setConfirmation('');
      setMode('dashboard');
    });
  }

  function unlock() {
    return submit(async () => {
      const result = checkPin(credential.current, pin);
      await storeCredential(result.credential);
      setPin('');
      if (!result.credential) {
        clearScreen('password');
        throw new Error('Too many incorrect PIN attempts. Sign in with your password.');
      }
      if (!result.unlocked) throw new Error('Incorrect PIN.');

      api.restore(result.credential.token);
      try {
        const account = await api.request('accounts/me/');
        await saveSession();
        setProfile(account);
        setMode('dashboard');
      } catch (failure) {
        if (failure.status === 401) {
          await storeCredential(null);
          clearScreen('password');
          throw new Error('Your session has expired. Sign in with your password.');
        }
        api.restore();
        throw failure;
      }
    });
  }

  async function request(path, options) {
    const result = await api.request(path, { organization, ...options });
    await saveSession();
    return result;
  }

  function loadPayroll() {
    return submit(async () => {
      const data = await request('payroll-records/me/');
      setRecords(Array.isArray(data) ? data : data.results);
    });
  }

  function openDocument(path, filename, type = 'application/pdf') {
    return submit(async () => {
      const response = await request(path, type === 'application/pdf' ? { pdf: true } : { mime: type });
      await shareDocument(response, filename, type);
    });
  }

  return (
    <View style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Agrieldo Payroll</Text>
      {mode === 'dashboard' && profile ? (
        <>
          <Text style={styles.heading}>Welcome, {profile.first_name || profile.username}</Text>
          {['ADMIN', 'HR'].includes(profile.role) && profile.organizations?.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.label}>Organization</Text>
              <Button title="Default organization" disabled={busy || organization === null}
                onPress={() => { setOrganization(null); setRecords(null); setSummary(null); }} />
              {profile.organizations.map(company => (
                <Button key={company.id} title={company.name} disabled={busy || organization === company.id}
                  onPress={() => { setOrganization(company.id); setRecords(null); setSummary(null); }} />
              ))}
            </View>
          )}
          <View style={styles.navigation}>
            {Object.entries({
              home: 'Dashboard', leave: 'Leave', expenses: 'Expenses', profile: 'Profile',
              ...(['ADMIN', 'HR'].includes(profile.role) ? {
                employees: 'Employees', departments: 'Departments', payroll: 'Payroll runs', reports: 'Reports',
              } : {}),
              ...(profile.role === 'ADMIN' ? { hr: 'HR accounts', sites: 'Work sites and access', billing: 'Billing' } : {}),
            }).map(([key, label]) => <Button key={key} title={label} disabled={busy || page === key}
              onPress={() => { setPage(key); setError(''); }} />)}
          </View>
          {page === 'home' && <>
          <View style={styles.group}>
            <Text style={styles.label}>Payroll overview</Text>
            <Button title="Load overview" disabled={busy} onPress={() => submit(async () =>
              setSummary((await request('dashboard/summary/')).metrics))} />
            {summary && Object.entries(summary).map(([key, value]) => (
              <Text key={key}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}  {value}</Text>
            ))}
          </View>
          <Attendance key={organization ?? 'default'} {...{ request, submit, busy, styles }} />
          <View style={styles.group}>
            <Text style={styles.label}>Pay history</Text>
            <Button title="Load pay history" onPress={loadPayroll} disabled={busy} />
            {records?.length === 0 && <Text>No processed payslips are available.</Text>}
            {records?.map((record) => (
              <View key={record.id} style={styles.record}>
                <Text style={styles.label}>{record.payroll_run_name}</Text>
                <Text>{record.payroll_start_date}</Text>
                <Text>Net pay  {record.net_pay}</Text>
                <Button title="Download payslip (PDF)" disabled={busy} onPress={() =>
                  openDocument(`payroll-records/${record.id}/payslip/`, `payslip-${record.id}`)} />
              </View>
            ))}
          </View>
          <View style={styles.group}>
            <Text style={styles.label}>P9 tax certificate</Text>
            <TextInput accessibilityLabel="Tax year" style={styles.input} value={year}
              onChangeText={setYear} keyboardType="number-pad" maxLength={4} />
            <Button title="Download P9 (PDF)" disabled={busy || !/^[0-9]{4}$/.test(year)}
              onPress={() => openDocument(`payroll-records/p9/pdf/?year=${year}`, `p9-${year}-${profile.id}-${organization ?? "default"}`)} />
          </View>
          </>}
          {page === 'leave' && <Leave key={organization ?? 'default'} {...{ request, submit, busy, styles, profile }} />}
          {page === 'expenses' && <Expenses key={organization ?? 'default'}
            {...{ request, submit, busy, styles, profile, openDocument }} />}
          {page === 'sites' && profile.role === 'ADMIN' && <WorkSites key={organization ?? 'default'}
            {...{ request, submit, busy, styles, openDocument }} />}
          {page === 'profile' && <Profile key={organization ?? 'default'} {...{ request, submit, busy, styles, profile, setProfile }} />}
          {['employees', 'departments', 'payroll', 'hr'].includes(page) && (
            <Records key={page + (organization ?? 'default')} resource={page} {...{ request, submit, busy, styles }} />
          )}
          {page === 'billing' && <Billing key={organization ?? 'default'} {...{ request, submit, busy, styles }} />}
          {page === 'reports' && <Reports key={organization ?? 'default'} {...{ request, submit, busy, styles, openDocument }} />}
          <Button title="Lock app" disabled={busy} onPress={() => {
            clearScreen('unlock');
            setError('');
          }} />
          <Button title="Sign out" onPress={signOut} disabled={busy} />
        </>
      ) : mode === 'setup' || mode === 'unlock' ? (
        <>
          <Text style={styles.heading}>{mode === 'setup' ? 'Set your PIN' : 'Unlock payroll'}</Text>
          <Text style={styles.label}>Four-digit PIN</Text>
          <TextInput accessibilityLabel="Four-digit PIN" secureTextEntry keyboardType="number-pad"
            maxLength={4} editable={!busy} onChangeText={setPin} value={pin} style={styles.input} />
          {mode === 'setup' && (
            <>
              <Text style={styles.label}>Confirm PIN</Text>
              <TextInput accessibilityLabel="Confirm PIN" secureTextEntry keyboardType="number-pad"
                maxLength={4} editable={!busy} onChangeText={setConfirmation} value={confirmation} style={styles.input} />
            </>
          )}
          <Button title={mode === 'setup' ? 'Save PIN' : 'Unlock'}
            disabled={busy || !isPin(pin) || (mode === 'setup' && !isPin(confirmation))}
            onPress={mode === 'setup' ? setUpPin : unlock} />
          <Button title="Use account password" disabled={busy} onPress={signOut} />
        </>
      ) : mode === 'register' || mode === 'recovery' ? (
        <AccountAccess key={mode} {...{ mode, api, submit, busy, styles }}
          onBack={() => { setMode('password'); setError(''); }}
          onRegistered={account => { setUsername(account); setPassword(''); setMode('password'); }} />
      ) : (
        <>
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.label}>Username or phone number</Text>
          <TextInput accessibilityLabel="Username or phone number" autoCapitalize="none"
            autoComplete="username" onChangeText={setUsername} value={username} style={styles.input} />
          <Text style={styles.label}>Password</Text>
          <TextInput accessibilityLabel="Password" secureTextEntry autoComplete="current-password"
            onChangeText={setPassword} value={password} style={styles.input} />
          <Button title="Sign in" onPress={signIn} disabled={busy || !username.trim() || !password} />
          <Button title="Forgot password" disabled={busy} onPress={() => { setError(''); setMode('recovery'); }} />
          <Button title="Set up an organization" disabled={busy} onPress={() => { setError(''); setMode('register'); }} />
        </>
      )}
      {busy && <ActivityIndicator accessibilityLabel="Loading" />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </ScrollView>
    {!foreground && <View style={styles.privacyCover}>
      <Text style={styles.brand}>Agrieldo Payroll</Text>
    </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  privacyCover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f9fc' },
  safeArea: { flex: 1, backgroundColor: '#f6f9fc' },
  screen: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, gap: 14, backgroundColor: '#f6f9fc' },
  brand: { fontSize: 16, fontWeight: '700', color: '#255779' },
  heading: { fontSize: 30, fontWeight: '700', color: '#172b3a' },
  label: { fontSize: 16, fontWeight: '600', color: '#172b3a' },
  input: { minHeight: 48, backgroundColor: '#fff', borderWidth: 1, borderColor: '#8498a9', borderRadius: 8, paddingHorizontal: 12, color: '#172b3a' },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { padding: 16, gap: 12, backgroundColor: '#fff', borderRadius: 12 },
  record: { gap: 4, borderTopWidth: 1, borderColor: '#dae3eb', paddingTop: 12 },
  error: { color: '#a32525' },
});
