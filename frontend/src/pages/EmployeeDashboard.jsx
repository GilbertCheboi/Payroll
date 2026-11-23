import React, { useEffect, useState } from "react";
import API from "../api";

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function EmployeeDashboard() {
  const [profile, setProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadEmployeeDashboard = async () => {
      try {
        const [profileResponse, recordsResponse] = await Promise.all([
          API.get("accounts/me/"),
          API.get("payroll-records/me/"),
        ]);
        setProfile(profileResponse.data);
        setRecords(recordsResponse.data || []);
      } catch (requestError) {
        console.error("Employee dashboard loading failed:", requestError);
        setError("Unable to load your employee dashboard.");
      } finally {
        setLoading(false);
      }
    };

    loadEmployeeDashboard();
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-300">Loading your dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-rose-400">{error}</div>;
  }

  const payrollProfile = profile?.payroll_profile;
  const latestRecord = records[0];
  const totalNetPay = records.reduce(
    (total, record) => total + Number(record.net_pay || 0),
    0,
  );
  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.username ||
    "Employee";

  return (
    <div className="space-y-6 p-8 text-white">
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
          Employee workspace
        </p>
        <h1 className="mt-3 text-3xl font-black">Welcome, {displayName}</h1>
        <p className="mt-2 text-slate-400">
          Your personal payroll, profile, and payment history in one place.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="rounded-full bg-slate-950 px-4 py-2">
            ID: {payrollProfile?.employee_id || "Not assigned"}
          </span>
          <span className="rounded-full bg-slate-950 px-4 py-2">
            {payrollProfile?.department_name || "Department not assigned"}
          </span>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Base salary
          </p>
          <p
            className="mt-3 text-2xl font-black"
            style={{ color: "var(--accent)" }}
          >
            Ksh {money(payrollProfile?.base_salary)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Monthly contract amount</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Latest net pay
          </p>
          <p className="mt-3 text-2xl font-black text-white">
            Ksh {money(latestRecord?.net_pay)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {latestRecord?.paid ? "Payment completed" : "Processed payroll"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Payroll statements
          </p>
          <p className="mt-3 text-2xl font-black text-white">
            {records.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Available to review</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Total net pay
          </p>
          <p className="mt-3 text-2xl font-black text-white">
            Ksh {money(totalNetPay)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across available statements
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Recent pay statements</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your finalized payroll records only.
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: "var(--accent-bg)",
                color: "var(--accent)",
              }}
            >
              Private view
            </span>
          </div>
          {records.length === 0 ? (
            <p className="mt-8 rounded-xl bg-slate-950 p-5 text-sm text-slate-400">
              No finalized payroll statements are available yet.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {records.slice(0, 5).map((record) => (
                <div
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-950 p-4"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {record.payroll_run_name || "Payroll statement"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {record.created_at
                        ? new Date(record.created_at).toLocaleDateString()
                        : "Date unavailable"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold" style={{ color: "var(--accent)" }}>
                      Ksh {money(record.net_pay)}
                    </p>
                    <p className="text-xs text-slate-500">Net pay</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">Your employment details</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-800 pb-3">
              <dt className="text-slate-500">Joined</dt>
              <dd className="text-right text-slate-200">
                {payrollProfile?.joining_date || "Not available"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-800 pb-3">
              <dt className="text-slate-500">Bank</dt>
              <dd className="text-right text-slate-200">
                {payrollProfile?.bank_name || "Not provided"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-800 pb-3">
              <dt className="text-slate-500">Account</dt>
              <dd className="text-right text-slate-200">
                {payrollProfile?.bank_account || "Not provided"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Email</dt>
              <dd className="max-w-[12rem] break-words text-right text-slate-200">
                {profile?.email || "Not provided"}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
