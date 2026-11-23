import React, { useState, useEffect, useRef } from "react";
import API from "./api";

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const dateInputRef = useRef(null);

  // Form Inputs State
  const [form, setForm] = useState({
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    employee_id: "",
    kra_pin: "",
    department: "",
    joining_date: "",
    base_salary: 0,
    allowance: 0,
    deductions: 0,
    nssf: 0,
    sha: 0,
    kra: 0,
    housing_levy: 0,
    sacco_contribution: 0,
    sacco_repayment: 0,
    helb_monthly_amount: 0,
    tax_class: "STANDARD",
    bank_name: "",
    bank_account: "",
  });

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [empRes, deptRes] = await Promise.all([
        API.get(`employees/${showDeactivated ? "?status=deactivated" : ""}`),
        API.get("departments/"),
      ]);

      const employeesData = Array.isArray(empRes.data)
        ? empRes.data
        : empRes.data?.results || empRes.data?.data || [];

      const departmentsData = Array.isArray(deptRes.data)
        ? deptRes.data
        : deptRes.data?.results || deptRes.data?.data || [];

      setEmployees(employeesData);
      setDepartments(departmentsData);
    } catch (err) {
      console.error("Error fetching payroll datasets.", err);
      setMsg("Failed to fetch required database structures.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [showDeactivated]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const numericFields = new Set([
      "base_salary",
      "allowance",
      "deductions",
      "sacco_contribution",
      "sacco_repayment",
      "nssf",
      "sha",
      "kra",
      "housing_levy",
      "helb_monthly_amount",
    ]);
    const newValue = (() => {
      if (!numericFields.has(name)) return value;
      if (value === "") return "";
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    })();
    setForm((prev) => ({ ...prev, [name]: newValue }));
  };

  const handleResetForm = () => {
    setEditingEmployee(null);
    setForm({
      username: "",
      password: "",
      first_name: "",
      last_name: "",
      email: "",
      phone_number: "",
      employee_id: "",
      kra_pin: "",
      department: "",
      joining_date: "",
      base_salary: 0,
      allowance: 0,
      deductions: 0,
      nssf: "",
      sha: "",
      kra: "",
      housing_levy: "",
      sacco_contribution: 0,
      sacco_repayment: 0,
      helb_monthly_amount: 0,
      tax_class: "STANDARD",
      bank_name: "",
      bank_account: "",
    });
  };

  const handleSelectEmployee = (employee) => {
    setEditingEmployee(employee);
    setForm({
      username: employee.username || "",
      password: "",
      first_name: employee.first_name || "",
      last_name: employee.last_name || "",
      email: employee.email || "",
      phone_number: employee.phone_number || "",
      employee_id: employee.payroll_profile?.employee_id || "",
      kra_pin: employee.payroll_profile?.kra_pin || "",
      department: employee.payroll_profile?.department || "",
      joining_date: employee.payroll_profile?.joining_date || "",
      base_salary: employee.payroll_profile?.base_salary ?? 0,
      allowance: employee.payroll_profile?.allowance ?? 0,
      deductions: employee.payroll_profile?.deductions ?? 0,
      nssf: employee.payroll_profile?.nssf ?? "",
      sha: employee.payroll_profile?.sha ?? "",
      kra: employee.payroll_profile?.kra ?? "",
      housing_levy: employee.payroll_profile?.housing_levy ?? "",
      sacco_contribution: employee.payroll_profile?.sacco_contribution ?? 0,
      sacco_repayment: employee.payroll_profile?.sacco_repayment ?? 0,
      helb_monthly_amount: employee.payroll_profile?.helb_monthly_amount ?? 0,
      tax_class: employee.payroll_profile?.tax_class || "STANDARD",
      bank_name: employee.payroll_profile?.bank_name ?? "",
      bank_account: employee.payroll_profile?.bank_account ?? "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const toNumber = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
      };

      const payrollProfile = {
        kra_pin: form.kra_pin,
        department: parseInt(form.department, 10) || null,
        joining_date: form.joining_date,
        base_salary: toNumber(form.base_salary),
        allowance: toNumber(form.allowance),
        deductions: toNumber(form.deductions),
        nssf: toNumber(form.nssf),
        sha: toNumber(form.sha),
        kra: toNumber(form.kra),
        housing_levy: toNumber(form.housing_levy),
        sacco_contribution: toNumber(form.sacco_contribution),
        sacco_repayment: toNumber(form.sacco_repayment),
        helb_monthly_amount: toNumber(form.helb_monthly_amount),
        tax_class: form.tax_class,
        bank_name: form.bank_name,
        bank_account: form.bank_account,
      };

      if (!editingEmployee) {
        payrollProfile.employee_id = form.employee_id;
      }

      const payload = {
        username: form.username,
        ...(form.password ? { password: form.password } : {}),
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number,
        payroll_profile: payrollProfile,
      };

      console.debug(
        editingEmployee ? "PATCH payload:" : "POST payload:",
        payload,
      );

      if (editingEmployee) {
        await API.patch(`employees/${editingEmployee.id}/`, payload);
        setMsg("Employee profile updated successfully.");
      } else {
        await API.post("employees/", payload);
        setMsg("Employee profile saved to payroll registry.");
      }

      handleResetForm();
      const empRes = await API.get("employees/");

      const refreshedEmployees = Array.isArray(empRes.data)
        ? empRes.data
        : empRes.data?.results || empRes.data?.data || [];

      setEmployees(refreshedEmployees);
    } catch (err) {
      console.error(err.response?.data || err);
      const errMsg = err.response?.data
        ? JSON.stringify(err.response.data)
        : "Onboarding error. Check unique parameter items.";
      setMsg(errMsg);
    }
  };

  const handleDelete = async (employee) => {
    const employeeName =
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      employee.username;
    if (
      !window.confirm(
        `Remove ${employeeName} from the active employee roster? Payroll history will be preserved.`,
      )
    )
      return;

    try {
      await API.delete(`employees/${employee.id}/`);
      if (editingEmployee?.id === employee.id) handleResetForm();
      setEmployees((current) =>
        current.filter((item) => item.id !== employee.id),
      );
      setMsg(
        "Employee removed from the active roster. Payroll history was preserved.",
      );
    } catch (err) {
      setMsg("Failed to delete employee profile.");
    }
  };

  return (
    <div className="space-y-8 p-6 text-white max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-black tracking-tight">
          EMPLOYEE MANAGEMENT
        </h2>
        <p className="text-slate-400 text-sm">
          Register new staff members or audit historical payroll profile data
          cards.
        </p>
      </div>

      {msg && (
        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium text-sm">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* 1. Onboarding Input Panel */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-1 bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl"
        >
          <h3 className="text-lg font-bold text-slate-100 border-b border-slate-800 pb-2">
            {editingEmployee ? "Edit Employee Profile" : "Onboard New Employee"}
          </h3>

          {editingEmployee && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 text-amber-200 text-sm">
              Editing employee{" "}
              <span className="font-semibold">
                {editingEmployee.first_name} {editingEmployee.last_name}
              </span>
              .{" "}
              <button
                type="button"
                onClick={handleResetForm}
                className="underline text-amber-100 hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Auth & Identity Rows */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Username
              </label>
              <input
                type="text"
                name="username"
                required
                value={form.username}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                required={!editingEmployee}
                value={form.password}
                onChange={handleChange}
                placeholder={
                  editingEmployee
                    ? "Leave blank to keep current password"
                    : "Enter password"
                }
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  name="first_name"
                  required
                  value={form.first_name}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  name="last_name"
                  required
                  value={form.last_name}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Corporate Email
              </label>
              <input
                type="email"
                name="email"
                required
                value={form.email}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                name="phone_number"
                required
                autoComplete="tel"
                placeholder="0700236628 or +254700236628"
                value={form.phone_number}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
              />
            </div>
          </div>

          {/* Corporate Allocation & Hierarchy Rows */}
          <h4 className="text-xs font-bold text-blue-400 tracking-wider uppercase pt-2">
            Payroll & Placement
          </h4>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Employee ID
                </label>
                <input
                  type="text"
                  name="employee_id"
                  required
                  disabled={!!editingEmployee}
                  value={form.employee_id}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Joining Date
                </label>
                <div className="relative">
                  <input
                    ref={dateInputRef}
                    type="date"
                    name="joining_date"
                    required
                    value={form.joining_date}
                    onChange={handleChange}
                    onClick={() =>
                      dateInputRef.current?.showPicker?.() ??
                      dateInputRef.current?.focus()
                    }
                    onFocus={() =>
                      dateInputRef.current?.showPicker?.() ??
                      dateInputRef.current?.focus()
                    }
                    className="w-full bg-slate-950 border border-slate-800 p-2 pr-10 text-sm rounded text-slate-300 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      dateInputRef.current?.showPicker?.() ??
                      dateInputRef.current?.focus()
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-5 w-5"
                    >
                      <path d="M7 10h5v5H7v-5Zm7 0h3v5h-3v-5Zm-8 9q-.825 0-1.412-.587Q4 17.825 4 17V7q0-.825.588-1.413Q5.175 5 6 5h1V3h2v2h6V3h2v2h1q.825 0 1.413.587Q20 6.175 20 7v10q0 .825-.587 1.413Q18.825 19 18 19Zm0-2h12V9H6Zm0-10v10V7Zm0 10V7v10Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Employee KRA PIN
              </label>
              <input
                type="text"
                name="kra_pin"
                required
                maxLength={11}
                placeholder="A123456789B"
                autoCapitalize="characters"
                value={form.kra_pin}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded uppercase"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Department Placement
              </label>
              <select
                name="department"
                required
                value={form.department}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded text-white outline-none focus:border-blue-500"
              >
                <option value="" disabled hidden>
                  -- Select Department --
                </option>
                {(departments || []).map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Base Salary
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="base_salary"
                  required
                  value={form.base_salary}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Allowance
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="allowance"
                  value={form.allowance}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Custom Deductions
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="deductions"
                  value={form.deductions}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                  placeholder="Additional deductions"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  HELB Monthly
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="helb_monthly_amount"
                  value={form.helb_monthly_amount}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                  placeholder="HELB loan repayment"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  NSSF Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="nssf"
                  value={form.nssf}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                  placeholder="Optional override"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  SHA Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="sha"
                  value={form.sha}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                  placeholder="Optional override"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  KRA Amount (PAYE)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="kra"
                  value={form.kra}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                  placeholder="Optional override"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Housing Levy
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="housing_levy"
                  value={form.housing_levy}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                  placeholder="Optional override"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Sacco Contribution
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="sacco_contribution"
                  value={form.sacco_contribution}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                  Sacco Repayment
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="sacco_repayment"
                  value={form.sacco_repayment}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Tax Classification
              </label>
              <select
                name="tax_class"
                value={form.tax_class}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded text-white"
              >
                <option value="STANDARD">Standard PAYE</option>
                <option value="EXEMPT">Tax Exempt</option>
              </select>
            </div>
          </div>

          {/* Financial Elements Card */}
          <h4 className="text-xs font-bold text-blue-400 tracking-wider uppercase pt-2">
            Bank Remittance Node
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Bank Name
              </label>
              <input
                type="text"
                name="bank_name"
                value={form.bank_name}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">
                Account Number
              </label>
              <input
                type="text"
                name="bank_account"
                value={form.bank_account}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-2 text-sm rounded"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold p-2.5 rounded-xl text-sm tracking-wide shadow-lg transition duration-150"
          >
            {editingEmployee ? "Update Profile" : "Commit Profile Matrix"}
          </button>
        </form>

        {/* 2. Employee Matrix Ledger Directory Grid */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 bg-slate-950/40 border-b border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-slate-200">
                {showDeactivated
                  ? "Deactivated Employee Accounts"
                  : "Active Tenant Roster Ledger"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingEmployee(null);
                  setShowDeactivated((current) => !current);
                }}
                className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-800 transition"
              >
                {showDeactivated
                  ? "View Active Employees"
                  : "View Deactivated Accounts"}
              </button>
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm animate-pulse">
              Syncing environment records...
            </div>
          ) : !employees || employees.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              No employee accounts registered under this workspace profile node
              yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <th className="p-4">Employee ID</th>
                    <th className="p-4">Staff Member</th>
                    <th className="p-4">Joining Date</th>
                    <th className="p-4">Corporate Position / Placement</th>
                    <th className="p-4">Actions</th>
                    <th className="p-4 text-right">Base Remittance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {(employees || []).map((emp) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-950/20 transition duration-100"
                    >
                      <td className="p-4 text-slate-400 font-mono text-xs">
                        {emp.payroll_profile?.employee_id || "N/A"}
                      </td>
                      <td className="p-4 font-bold text-white">
                        {emp.first_name} {emp.last_name}
                        <div className="text-xs font-normal text-slate-400 font-mono">
                          {emp.email}
                        </div>
                      </td>
                      <td className="p-4 text-slate-300 text-sm">
                        {emp.payroll_profile?.joining_date || "N/A"}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-md font-semibold tracking-wide uppercase">
                          {emp.payroll_profile?.department_name ||
                            emp.payroll_profile?.department ||
                            "Unknown Dept"}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {showDeactivated ? (
                          <span className="text-xs font-semibold text-amber-300">
                            Deactivated
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectEmployee(emp)}
                              className="rounded-full bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(emp)}
                              className="ml-2 rounded-full bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-emerald-400">
                        Ksh{" "}
                        {parseFloat(
                          emp.payroll_profile?.base_salary || 0,
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
