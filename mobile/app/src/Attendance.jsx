import React, { useRef, useState } from 'react';
import { Button, Modal, Text, View } from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { SafeAreaView } from 'react-native-safe-area-context';
import { currentLocation, requestCamera, requestId } from './nativeTools';

export default function Attendance({ request, submit, busy, styles }) {
  const [action, setAction] = useState(null);
  const [status, setStatus] = useState(null);
  const [retry, setRetry] = useState(null);
  const scanned = useRef(false);

  async function refreshStatus() {
    setStatus(await request('attendance/'));
  }

  function sendScan(body) {
    return submit(async () => {
      const last_event = await request('attendance/', { body });
      setRetry(null);
      setStatus({ checked_in: last_event.action === 'in', last_event });
    });
  }

  function start(nextAction) {
    submit(async () => {
      await requestCamera();
      scanned.current = false;
      setAction(nextAction);
    });
  }

  function onScan(event) {
    if (scanned.current || !action) return;
    scanned.current = true;
    const code = event.nativeEvent.codeStringValue;
    setAction(null);
    submit(async () => {
      if (!/^payroll-site:[a-f0-9-]{36}$/i.test(code)) {
        throw new Error('Scan the printed payroll QR code for your work site.');
      }
      const location = await currentLocation();
      if (location.mocked) throw new Error('Use a live location reading to record attendance.');
      const { latitude, longitude, accuracy } = location.coords;
      const body = {
        code, action, latitude, longitude, accuracy,
        measured_at: new Date(location.timestamp).toISOString(), request_id: requestId(),
      };
      setRetry(body);
      try {
        const last_event = await request('attendance/', { body });
        setRetry(null);
        setStatus({ checked_in: action === 'in', last_event });
      } catch (error) {
        if (error.status && error.status < 500) setRetry(null);
        throw error;
      }
    });
  }

  const latest = status?.last_event;
  return (
    <View style={styles.group}>
      <Text style={styles.label}>Attendance</Text>
      {latest && (
        <Text>{latest.action === 'in' ? 'Checked in' : 'Checked out'} at {latest.site}{'\n'}
          {new Date(latest.recorded_at).toLocaleString(undefined, { timeZone: latest.time_zone })}
        </Text>
      )}
      {status && !latest && <Text>No attendance recorded yet.</Text>}
      <Button title="Check in" disabled={busy || status?.checked_in === true || !!retry} onPress={() => start('in')} />
      <Button title="Check out" disabled={busy || status?.checked_in === false || !!retry} onPress={() => start('out')} />
      <Button title="Refresh attendance" disabled={busy} onPress={() => submit(refreshStatus)} />
      {retry && <>
        <Button title="Retry last scan" disabled={busy} onPress={() => sendScan(retry)} />
        <Button title="Discard retry and refresh" disabled={busy} onPress={() => submit(async () => {
          await refreshStatus();
          setRetry(null);
        })} />
      </>}
      <Modal visible={!!action} onRequestClose={() => setAction(null)}>
        <SafeAreaView style={{ flex: 1 }}>
          <Text style={styles.label}>Scan the printed work site QR code</Text>
          {action && <Camera style={{ flex: 1 }} cameraType={CameraType.Back} scanBarcode onReadCode={onScan} />}
          <Button title="Cancel scan" onPress={() => setAction(null)} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}
