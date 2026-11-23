import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';

const emptySite = { name: '', latitude: '', longitude: '', radius_metres: '100', time_zone: 'Africa/Nairobi' };

export default function WorkSites({ request, submit, busy, styles, openDocument }) {
  const [sites, setSites] = useState(null);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(emptySite);
  const [account, setAccount] = useState({ username: '', password: '', first_name: '', last_name: '' });
  const [created, setCreated] = useState('');
  const endpoint = selected ? `work-sites/${selected.id}/` : 'work-sites/';

  async function load() {
    const data = await request('work-sites/');
    setSites(Array.isArray(data) ? data : data.results);
  }

  function select(site) {
    setSelected(site);
    setDetails(site ? Object.fromEntries(Object.keys(emptySite).map(key => [key, String(site[key])])) : emptySite);
  }

  return (
    <>
      <View style={styles.group}>
        <Text style={styles.label}>Work sites</Text>
        <Button title="Load sites" disabled={busy} onPress={() => submit(load)} />
        {sites?.map(site => <Button key={site.id} title={site.name} onPress={() => select(site)} disabled={busy} />)}
        {selected && <Button title="New site" onPress={() => select(null)} disabled={busy} />}
        {Object.entries({
          name: 'Site name', latitude: 'Latitude', longitude: 'Longitude',
          radius_metres: 'Allowed radius (metres)', time_zone: 'IANA time zone',
        }).map(([key, label]) => (
          <TextInput key={key} value={details[key]} placeholder={label} accessibilityLabel={label}
            style={styles.input} editable={!busy}
            onChangeText={value => setDetails({ ...details, [key]: value })} />
        ))}
        <Button title={selected ? 'Save site' : 'Create site'} disabled={busy || Object.values(details).some(value => !value.trim())}
          onPress={() => submit(async () => {
            select(await request(endpoint, { method: selected ? 'PATCH' : 'POST', body: details }));
            await load();
          })} />
        {selected && <>
          <Button title="Download printable QR" disabled={busy} onPress={() =>
            openDocument(endpoint + 'qr/', `work-site-${selected.id}-qr`)} />
          <Button title={selected.active ? 'Deactivate site' : 'Reactivate site'} disabled={busy}
            onPress={() => submit(async () => {
              select(await request(endpoint, { method: 'PATCH', body: { active: !selected.active } }));
              await load();
            })} />
          <Button title="Replace QR code" disabled={busy} onPress={() => Alert.alert(
            'Replace printed QR code?', 'The current code will stop working. Download and print the replacement.',
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', onPress: () => submit(() =>
              request(endpoint + 'rotate-qr/', { body: {} })) }],
          )} />
        </>}
      </View>
      <View style={styles.group}>
        <Text style={styles.label}>Create accountant account</Text>
        {Object.entries({
          username: 'Username', first_name: 'First name', last_name: 'Last name', password: 'Initial password',
        }).map(([key, label]) => (
          <TextInput key={key} value={account[key]} placeholder={label} accessibilityLabel={label}
            style={styles.input} editable={!busy} secureTextEntry={key === 'password'}
            autoCapitalize={key === 'username' || key === 'password' ? 'none' : 'words'}
            onChangeText={value => setAccount({ ...account, [key]: value })} />
        ))}
        <Button title="Create accountant" disabled={busy || !account.username.trim() || !account.password}
          onPress={() => submit(async () => {
            const createdAccount = await request('accounts/', { body: { ...account, role: 'ACCOUNTANT' } });
            setCreated(createdAccount.username);
            setAccount({ username: '', password: '', first_name: '', last_name: '' });
          })} />
        {!!created && <Text>Accountant account created for {created}.</Text>}
      </View>
    </>
  );
}
