import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';

const accountFields = {
  username: 'Username', first_name: 'First name', last_name: 'Last name', email: 'Email',
  phone_number: 'Phone number', password: 'Password',
};
const payrollFields = {
  employee_id: 'Employee ID', kra_pin: 'Employee KRA PIN', joining_date: 'Joining date (YYYY-MM-DD)',
  base_salary: 'Base salary', allowance: 'Allowance', deductions: 'Other deductions',
  nssf: 'NSSF', sha: 'SHA', kra: 'KRA contribution', housing_levy: 'Housing levy',
  sacco_contribution: 'SACCO contribution', sacco_repayment: 'SACCO loan repayment',
  helb_monthly_amount: 'HELB', bank_name: 'Bank name', bank_account: 'Bank account',
};
const companyFields = { name: 'Organization name', kra_pin: 'Organization KRA PIN',
  currency: 'Currency', theme_color: 'Theme color (hex)' };
const collection = value => Array.isArray(value) ? value : value.results;
const valueFields = (fields, values = {}) => Object.fromEntries(Object.keys(fields).map(key => [key, values[key] ?? '']));
const defined = values => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));

export function Fields({ fields, values, setValues, styles, busy }) {
  return Object.entries(fields).map(([key, label]) => (
    <View key={key} style={{ gap: 4 }}>
      <Text>{label}</Text>
      <TextInput value={String(values[key] ?? '')} accessibilityLabel={label} style={styles.input} editable={!busy}
        secureTextEntry={key === 'password' || key === 'confirmation'} autoCapitalize={['password', 'email', 'username'].includes(key) ? 'none' : 'sentences'}
        onChangeText={value => setValues({ ...values, [key]: value })} />
    </View>
  ));
}

export function Profile({ profile, setProfile, request, submit, busy, styles }) {
  const fields = { first_name: 'First name', last_name: 'Last name', email: 'Email', phone_number: 'Phone number',
    password: 'New password (optional)' };
  const [values, setValues] = useState(valueFields(fields, profile));
  const [company, setCompany] = useState(null);
  const [message, setMessage] = useState('');

  return <>
    <View style={styles.group}>
      <Text style={styles.label}>My profile</Text>
      <Text>{profile.username} · {profile.organization_name || 'No organization'}</Text>
      <Fields {...{ fields, values, setValues, styles, busy }} />
      <Button title="Save profile" disabled={busy} onPress={() => submit(async () => {
        const { password, phone_number, ...contact } = values;
        const body = { ...contact, phone_number: phone_number || null, ...(password ? { password } : {}) };
        const updated = await request('accounts/me/', { method: 'PATCH', body });
        setProfile(updated);
        setValues(valueFields(fields, updated));
        setMessage('Profile saved.');
      })} />
      {!!message && <Text>{message}</Text>}
    </View>
    {['ADMIN', 'HR'].includes(profile.role) && <View style={styles.group}>
      <Text style={styles.label}>Organization settings</Text>
      <Button title="Load organization settings" disabled={busy} onPress={() => submit(async () =>
        setCompany(await request('accounts/organization/')))} />
      {company && <>
        <Fields fields={companyFields} values={company} setValues={setCompany} {...{ styles, busy }} />
        <Button title="Save organization settings" disabled={busy} onPress={() => submit(async () => {
          setCompany(await request('accounts/organization/', { method: 'PATCH', body: valueFields(companyFields, company) }));
          setMessage('Organization settings saved.');
        })} />
      </>}
    </View>}
  </>;
}

const configurations = {
  employees: { endpoint: 'employees/', title: 'Employees', fields: accountFields, label: item => item.username },
  departments: { endpoint: 'departments/', title: 'Departments',
    fields: { name: 'Department name', code: 'Department code' }, label: item => item.name },
  payroll: { endpoint: 'payroll-runs/', title: 'Payroll runs',
    fields: { name: 'Payroll run name', start_date: 'Start date (YYYY-MM-DD)', end_date: 'End date (YYYY-MM-DD)' },
    label: item => `${item.name} · ${item.status}` },
  hr: { endpoint: 'accounts/', title: 'HR accounts', fields: accountFields, label: item => item.username },
};

export function Records({ resource, request, submit, busy, styles }) {
  const config = configurations[resource];
  const [items, setItems] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [inactive, setInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState(valueFields(config.fields));
  const [employee, setEmployee] = useState(valueFields(payrollFields));
  const employeeResource = resource === 'employees';

  async function load(includeInactive = inactive) {
    const suffix = resource === 'hr' ? '?role=HR' : employeeResource && includeInactive ? '?status=deactivated' : '';
    setItems(collection(await request(config.endpoint + suffix)));
    if (employeeResource) setDepartments(collection(await request('departments/')));
  }

  function open(item) {
    setSelected(item);
    setValues(valueFields(config.fields, item || {}));
    if (employeeResource) {
      setEmployee({ tax_class: 'STANDARD', ...valueFields(payrollFields), ...item?.payroll_profile });
    }
  }

  function save() {
    return submit(async () => {
      const body = employeeResource || resource === 'hr' ? defined(values) : values;
      if (resource === 'hr') body.role = 'HR';
      if (employeeResource) {
        body.payroll_profile = {
          ...defined(valueFields(payrollFields, employee)), department: employee.department,
          tax_class: employee.tax_class || 'STANDARD', bank_name: employee.bank_name || '', bank_account: employee.bank_account || '',
        };
        if (selected) delete body.payroll_profile.employee_id;
      }
      const updated = await request(selected ? config.endpoint + selected.id + '/' : config.endpoint, {
        method: selected ? 'PATCH' : 'POST', body,
      });
      open(updated);
      await load();
    });
  }

  function remove() {
    const verb = employeeResource ? 'Deactivate' : 'Delete';
    Alert.alert(`${verb} ${config.label(selected)}?`, 'Confirm this change.', [
      { text: 'Cancel', style: 'cancel' },
      { text: verb, style: 'destructive', onPress: () => submit(async () => {
        await request(config.endpoint + selected.id + '/', { method: 'DELETE' });
        open(null);
        await load();
      }) },
    ]);
  }

  const editable = !(employeeResource && inactive) && !(resource === 'payroll' && selected && selected.status !== 'DRAFT');

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{config.title}</Text>
      <Button title={`Load ${config.title.toLowerCase()}`} disabled={busy} onPress={() => submit(() => load())} />
      {employeeResource && <Button title={inactive ? 'Show active employees' : 'Show deactivated employees'}
        disabled={busy} onPress={() => submit(async () => {
          await load(!inactive);
          setInactive(!inactive);
          open(null);
        })} />}
      {items?.length === 0 && <Text>No records found.</Text>}
      {items?.map(item => (
        <Button key={item.id} title={config.label(item)} onPress={() => open(item)} disabled={busy} />
      ))}
      {selected && <Button title="Start a new record" disabled={busy} onPress={() => open(null)} />}
      {editable && <>
        <Fields fields={config.fields} {...{ values, setValues, styles, busy }} />
        {employeeResource && <>
          <Text style={styles.label}>Payroll profile</Text>
          <Fields fields={selected ? Object.fromEntries(Object.entries(payrollFields).filter(([key]) => key !== 'employee_id')) : payrollFields}
            values={employee} setValues={setEmployee} {...{ styles, busy }} />
          <Text>Department</Text>
          {departments.map(department => <Button key={department.id} title={department.name}
            disabled={busy || department.id === employee.department}
            onPress={() => setEmployee({ ...employee, department: department.id })} />)}
          <Text>Tax class</Text>
          {['STANDARD', 'EXEMPT'].map(tax_class => (
            <Button key={tax_class} title={tax_class === 'STANDARD' ? 'Standard PAYE' : 'Tax exempt'}
              disabled={busy || employee.tax_class === tax_class} onPress={() => setEmployee({ ...employee, tax_class })} />
          ))}
        </>}
        <Button title={selected ? 'Save changes' : 'Create record'}
          disabled={busy || (employeeResource && (!employee.department || (!selected && !values.password)))}
          onPress={save} />
      </>}
      {selected && editable && resource !== 'hr' &&
        <Button title={employeeResource ? 'Deactivate employee' : 'Delete record'} disabled={busy} onPress={remove} />}
      {resource === 'payroll' && selected && <>
        <Text>{selected.name} · {selected.status}</Text>
        {selected.status === 'DRAFT' && <Button title="Process payroll" disabled={busy} onPress={() => submit(async () => {
          open(await request(`payroll-runs/${selected.id}/process/`, { body: {} }));
          await load();
        })} />}
        {selected.records?.map(record => (
          <Text key={record.id}>{record.employee_name} · Gross {record.gross_pay} · Net {record.net_pay}</Text>
        ))}
      </>}
    </View>
  );
}

export function Billing({ request, submit, busy, styles }) {
  const [data, setData] = useState(null);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const invoice = data?.current_invoice;
  async function load() { setData(await request('billing/')); }

  return <View style={styles.group}>
    <Text style={styles.label}>Subscription billing</Text>
    <Button title="Load billing" disabled={busy} onPress={() => submit(load)} />
    {data && <>
      <Text>Employees {data.employee_count} · Total due {data.currency} {data.total_due}</Text>
      {data.invoices.map(row => <Text key={row.id}>{row.period_start} · {row.status} · {row.currency} {row.amount}</Text>)}
      {invoice && invoice.status !== 'PAID' && <>
        <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input}
          accessibilityLabel="M-Pesa phone number" placeholder="M-Pesa phone number" />
        <Button title="Request M-Pesa payment" disabled={busy || !data.payment_configured || !phone || invoice.payment_in_progress}
          onPress={() => submit(async () => {
            const result = await request('billing/pay/', { body: { invoice_id: invoice.id, phone_number: phone } });
            setMessage(result.detail);
            await load();
          })} />
        <Button title="Check payment status" disabled={busy || !data.payment_configured}
          onPress={() => submit(async () => {
            const result = await request(`billing/invoices/${invoice.id}/check/`, { body: {} });
            setMessage(result.invoice.status === 'PAID' ? 'Payment confirmed.' : 'Payment is pending.');
            await load();
          })} />
      </>}
      {!!message && <Text>{message}</Text>}
    </>}
  </View>;
}

export function Reports({ request, submit, busy, styles, openDocument }) {
  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [type, setType] = useState('bank');
  const [target, setTarget] = useState('');
  const [rows, setRows] = useState(null);
  const endpoint = `reports/financial/?payroll_run_id=${run}&type=${type}&target=${encodeURIComponent(target)}`;
  return <View style={styles.group}>
    <Text style={styles.label}>Financial reports</Text>
    <Button title="Load payroll runs" disabled={busy} onPress={() => submit(async () => setRuns(collection(await request('payroll-runs/'))))} />
    {runs.map(item => <Button key={item.id} title={item.name} disabled={busy || item.id === run}
      onPress={() => { setRun(item.id); setRows(null); }} />)}
    {Object.entries({ bank: 'Bank', sacco: 'SACCO' }).map(([value, label]) =>
      <Button key={value} title={label} disabled={busy || value === type} onPress={() => {
        setType(value); setRows(null);
      }} />)}
    <TextInput accessibilityLabel="Report filter" placeholder={type === 'bank' ? 'Bank name (optional)' : 'Department (optional)'}
      style={styles.input} value={target} onChangeText={setTarget} />
    <Button title="Generate report" disabled={busy || !run} onPress={() => submit(async () =>
      setRows((await request(endpoint)).data))} />
    <Button title="Save report (CSV)" disabled={busy || !run} onPress={() =>
      openDocument(endpoint + '&download=csv', `${type}-report-${run}`, 'text/csv')} />
    {rows?.length === 0 && <Text>No matching records.</Text>}
    {rows?.map((row, index) => <View key={`${row.employee_id}-${index}`} style={styles.record}>
      {Object.entries(row).map(([key, value]) => <Text key={key}>{key.replaceAll('_', ' ')}  {String(value)}</Text>)}
    </View>)}
  </View>;
}
