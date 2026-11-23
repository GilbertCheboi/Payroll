import React, { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';

const initial = { leave_type: 'ANNUAL', start_date: '', end_date: '', reason: '' };
const labels = { ANNUAL: 'Annual', SICK: 'Sick', PERSONAL: 'Personal', MATERNITY: 'Maternity',
  PATERNITY: 'Paternity', UNPAID: 'Unpaid', OTHER: 'Other' };

export default function Leave({ request, submit, busy, styles, profile }) {
  const [form, setForm] = useState(initial);
  const [entries, setEntries] = useState(null);
  const [notes, setNotes] = useState({});
  const reviewer = ['ADMIN', 'HR'].includes(profile.role);

  async function load() {
    const result = await request('leaves/');
    setEntries(Array.isArray(result) ? result : result.results);
  }

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{reviewer ? 'Leave requests' : 'My leave'}</Text>
      <Button title="Load leave requests" disabled={busy} onPress={() => submit(load)} />
      {profile.role === 'EMPLOYEE' && <>
        <Text>Leave type</Text>
        {Object.entries(labels).map(([value, name]) => (
          <Button key={value} title={name} disabled={busy || form.leave_type === value}
            onPress={() => setForm({ ...form, leave_type: value })} />
        ))}
        {Object.entries({ start_date: 'Start date (YYYY-MM-DD)', end_date: 'End date (YYYY-MM-DD)', reason: 'Reason' })
          .map(([key, label]) => (
            <TextInput key={key} accessibilityLabel={label} placeholder={label} style={styles.input}
              value={form[key]} editable={!busy} onChangeText={value => setForm({ ...form, [key]: value })} />
          ))}
        <Button title="Request leave" disabled={busy || !form.start_date || !form.end_date || !form.reason.trim()}
          onPress={() => submit(async () => {
            await request('leaves/', { body: form });
            setForm(initial);
            await load();
          })} />
      </>}
      {entries?.length === 0 && <Text>No leave requests.</Text>}
      {entries?.map(entry => (
        <View key={entry.id} style={styles.record}>
          <Text style={styles.label}>{labels[entry.leave_type]} · {entry.status}</Text>
          {reviewer && <Text>{entry.employee_name}</Text>}
          <Text>{entry.start_date} to {entry.end_date}</Text>
          <Text>{entry.reason}</Text>
          {!!entry.review_note && <Text>Review note  {entry.review_note}</Text>}
          {reviewer && entry.status === 'PENDING' && <>
            <TextInput accessibilityLabel="Review note" placeholder="Review note" style={styles.input}
              editable={!busy} value={notes[entry.id] || ''} onChangeText={text => setNotes({ ...notes, [entry.id]: text })} />
            {['approve', 'reject'].map(action => (
              <Button key={action} title={action === 'approve' ? 'Approve leave' : 'Reject leave'} disabled={busy}
                onPress={() => submit(async () => {
                  await request(`leaves/${entry.id}/${action}/`, { body: { review_note: notes[entry.id] || '' } });
                  await load();
                })} />
            ))}
          </>}
        </View>
      ))}
    </View>
  );
}
