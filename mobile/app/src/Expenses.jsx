import React, { useRef, useState } from 'react';
import { Button, Modal, Text, TextInput, View } from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { errorCodes, isErrorWithCode, pick, types } from '@react-native-documents/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestCamera } from './nativeTools';

const maxReceiptBytes = 5 * 1024 * 1024;
const categories = { transport: 'Transport', lunch: 'Lunch', other: 'Other' };
const methods = { mpesa: 'M-Pesa', bank: 'Bank transfer', cash: 'Cash' };
const statuses = {
  draft: 'Draft', submitted: 'Submitted', returned: 'Returned for correction',
  rejected: 'Rejected', approved: 'Approved · Awaiting reimbursement', reimbursed: 'Reimbursed',
};

export default function Expenses({ request, submit, busy, styles, profile, openDocument }) {
  const [claims, setClaims] = useState(null);
  const [selected, setSelected] = useState(null);
  const [purpose, setPurpose] = useState('');
  const [dutyDate, setDutyDate] = useState('');
  const [category, setCategory] = useState('transport');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('mpesa');
  const [paidOn, setPaidOn] = useState('');
  const [reference, setReference] = useState('');
  const camera = useRef(null);
  const path = selected ? `expenses/${selected.id}/` : null;
  const own = selected?.employee === profile.id;
  const editable = own && ['draft', 'returned'].includes(selected.status);
  const reviewer = profile.role === 'ACCOUNTANT' && selected && !own;

  async function refresh() {
    const result = await request('expenses/');
    setClaims(Array.isArray(result) ? result : result.results);
  }

  function open(claim) {
    setSelected(claim);
    setPurpose(claim?.purpose || '');
    setDutyDate(claim?.duty_date || '');
    setNote('');
    setAttachment(null);
    setAmount('');
    setDescription('');
    setPaidOn('');
    setReference('');
  }

  function updateClaim(endpoint, options) {
    return submit(async () => {
      const updated = await request(endpoint, options);
      setSelected(updated);
      await refresh();
    });
  }

  function saveDraft() {
    return updateClaim(path || 'expenses/', {
      method: path ? 'PATCH' : 'POST', body: { purpose, duty_date: dutyDate },
    });
  }

  function attachFile() {
    return submit(async () => {
      try {
        const [file] = await pick({ type: [types.pdf, types.images] });
        if (file.size > maxReceiptBytes) throw new Error('Select a receipt up to 5 MB.');
        setAttachment({ uri: file.uri, type: file.type || 'application/octet-stream', name: file.name || 'receipt' });
      } catch (error) {
        if (!isErrorWithCode(error) || error.code !== errorCodes.OPERATION_CANCELED) throw error;
      }
    });
  }

  function capturePhoto() {
    return submit(async () => {
      if (!camera.current) return;
      const photo = await camera.current.capture();
      setAttachment({ uri: photo.uri, type: 'image/jpeg', name: 'receipt.jpg' });
      setCameraOpen(false);
      if (photo.size > maxReceiptBytes) {
        setAttachment(null);
        throw new Error('This photo exceeds 5 MB. Attach a smaller copy of the receipt.');
      }
    });
  }

  function addLine() {
    return submit(async () => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ category, amount, description, receipt: attachment })) {
        form.append(key, value);
      }
      await request(path + 'lines/', { form });
      setAttachment(null);
      setAmount('');
      setDescription('');
      setSelected(await request(path));
      await refresh();
    });
  }

  function removeLine(id) {
    return submit(async () => {
      await request(path + `lines/${id}/`, { method: 'DELETE' });
      setSelected(await request(path));
      await refresh();
    });
  }

  const input = (label, value, change, options = {}) => (
    <TextInput accessibilityLabel={label} placeholder={label} value={value} onChangeText={change}
      style={styles.input} editable={!busy} {...options} />
  );
  const choose = (choices, current, change) => Object.entries(choices).map(([value, label]) =>
    <Button key={value} title={label} disabled={busy || current === value} onPress={() => change(value)} />);
  const draftForm = (!selected || editable) && <>
    {input('Duty purpose', purpose, setPurpose, { maxLength: 250 })}
    {input('Duty date (YYYY-MM-DD)', dutyDate, setDutyDate)}
    <Button title={selected ? 'Save claim details' : 'Create draft claim'}
      disabled={busy || !purpose.trim() || !dutyDate} onPress={saveDraft} />
  </>;

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{profile.role === 'ACCOUNTANT' ? 'Expenses and approvals' : 'Duty expenses'}</Text>
      <Button title="Load claims" disabled={busy} onPress={() => submit(refresh)} />
      {claims?.map(claim => (
        <Button key={claim.id} title={`${claim.purpose} · ${statuses[claim.status]}`}
          disabled={busy || claim.id === selected?.id} onPress={() => open(claim)} />
      ))}
      {selected && <Button title="New claim" disabled={busy} onPress={() => open(null)} />}
      {draftForm}
      {selected && <>
        <Text style={styles.label}>{selected.purpose} · {statuses[selected.status]}</Text>
        <Text>{selected.employee_name} · {selected.duty_date}</Text>
        <Text>Total {selected.currency} {selected.total}</Text>
        {selected.reviews.map(review => (
          <Text key={review.recorded_at}>{statuses[review.decision]}{review.note ? ` · ${review.note}` : ''}</Text>
        ))}
        {selected.lines.map(line => (
          <View key={line.id} style={styles.record}>
            <Text>{categories[line.category]} · {selected.currency} {line.amount}</Text>
            {!!line.description && <Text>{line.description}</Text>}
            <Button title="Open receipt" disabled={busy} onPress={() => openDocument(
              path + `lines/${line.id}/receipt/`, `receipt-${selected.id}-${line.id}`, line.receipt_type,
            )} />
            {editable && <Button title="Remove line" disabled={busy} onPress={() => removeLine(line.id)} />}
          </View>
        ))}
        {editable && <>
          <Text style={styles.label}>Add expense line</Text>
          {choose(categories, category, setCategory)}
          {input('Amount', amount, setAmount, { keyboardType: 'decimal-pad' })}
          {input('Description', description, setDescription, { maxLength: 200 })}
          <Button title="Attach receipt file" disabled={busy} onPress={attachFile} />
          <Button title="Photograph receipt" disabled={busy} onPress={() => submit(async () => {
            await requestCamera();
            setCameraOpen(true);
          })} />
          {attachment && <Text>{attachment.name}</Text>}
          <Button title="Add line" disabled={busy || !amount || !attachment} onPress={addLine} />
          <Button title="Submit for approval" disabled={busy || !selected.lines.length}
            onPress={() => updateClaim(path + 'submit/', { body: {} })} />
        </>}
        {reviewer && selected.status === 'submitted' && <>
          {input('Review note', note, setNote, { maxLength: 500 })}
          {Object.entries({ approved: 'Approve', returned: 'Return for correction', rejected: 'Reject' })
            .map(([decision, label]) => (
              <Button key={decision} title={label} disabled={busy || (decision !== 'approved' && !note.trim())}
                onPress={() => updateClaim(path + 'review/', { body: { decision, note } })} />
            ))}
        </>}
        {reviewer && selected.status === 'approved' && <>
          <Text style={styles.label}>Record full reimbursement</Text>
          {choose(methods, method, setMethod)}
          {input('Payment date (YYYY-MM-DD)', paidOn, setPaidOn)}
          {input('Payment reference (optional)', reference, setReference, { maxLength: 100 })}
          <Button title="Record reimbursement" disabled={busy || !paidOn} onPress={() => updateClaim(
            path + 'reimburse/', { body: { method, paid_on: paidOn, reference } },
          )} />
        </>}
        {selected.reimbursement && <Text>
          Paid {selected.currency} {selected.reimbursement.amount} by {methods[selected.reimbursement.method]}
          {' on '}{selected.reimbursement.paid_on}
          {selected.reimbursement.reference ? ` · ${selected.reimbursement.reference}` : ''}
        </Text>}
      </>}
      <Modal visible={cameraOpen} onRequestClose={() => setCameraOpen(false)}>
        <SafeAreaView style={{ flex: 1 }}>
          {cameraOpen && <Camera ref={camera} style={{ flex: 1 }} cameraType={CameraType.Back} />}
          <Button title="Take receipt photo" disabled={busy} onPress={capturePhoto} />
          <Button title="Cancel photo" disabled={busy} onPress={() => setCameraOpen(false)} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}
