import React, { useCallback, useEffect, useState } from "react";
import API from "../api";

const formatMoney = (value) =>
  `Ksh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const statusClasses = {
  PAID: "bg-emerald-500/10 text-emerald-400",
  PROCESSING: "bg-blue-500/10 text-blue-400",
  DUE: "bg-amber-500/10 text-amber-400",
  FAILED: "bg-rose-500/10 text-rose-400",
  OVERDUE: "bg-rose-500/10 text-rose-400",
};

export default function Billing() {
  const [billing, setBilling] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadBilling = useCallback(async () => {
    setError("");
    try {
      const response = await API.get("billing/");
      setBilling(response.data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "Unable to load organization billing.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const handlePayment = async (event) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await API.post("billing/pay/", {
        invoice_id: billing.current_invoice.id,
        phone_number: phoneNumber,
      });
      setMessage(response.data.detail);
      await loadBilling();
    } catch (requestError) {
      setError(
        requestError.response?.data?.phone_number?.[0] ||
          requestError.response?.data?.detail ||
          "Unable to start the M-Pesa payment.",
      );
    } finally {
      setWorking(false);
    }
  };

  const handleCheckStatus = async () => {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await API.post(
        `billing/invoices/${billing.current_invoice.id}/check/`,
      );
      setMessage(
        response.data.invoice.status === "PAID"
          ? "Payment confirmed. Thank you."
          : "Payment is still being processed. Approve the prompt or check again shortly.",
      );
      await loadBilling();
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "Unable to check the payment status.",
      );
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-300">Loading billing…</div>;
  }

  if (!billing) {
    return (
      <div className="rounded-2xl border border-rose-900 bg-slate-900 p-6 text-rose-300">
        {error || "Billing information is unavailable."}
      </div>
    );
  }

  const invoice = billing.current_invoice;
  const paymentPending = Boolean(invoice?.payment_in_progress);

  if (!invoice) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Organization billing</h1>
          <p className="mt-2 text-sm text-slate-400">
            Monthly pricing is Ksh 200 per active employee. Invoices are issued
            at month-end and are payable through the 7th of the following month.
          </p>
        </header>
        {!billing.payment_configured && (
          <div
            role="status"
            className="rounded-xl border border-amber-700/50 bg-amber-500/10 p-4 text-sm text-amber-200"
          >
            M-Pesa payments are not configured yet. An administrator must
            configure KopoKopo credentials, a Till number, and the public HTTPS
            callback URL on the server.
          </div>
        )}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-300 sm:p-6">
          No invoice has been issued yet. The first invoice will be issued on
          the last day of this month.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Organization billing</h1>
        <p className="mt-2 text-sm text-slate-400">
          Monthly pricing is Ksh 200 per active employee. Admin and HR accounts
          are not included.
        </p>
      </header>

      {!billing.payment_configured && (
        <div
          role="status"
          className="rounded-xl border border-amber-700/50 bg-amber-500/10 p-4 text-sm text-amber-200"
        >
          M-Pesa payments are not configured yet. An administrator must
          configure KopoKopo credentials, a Till number, and the public HTTPS
          callback URL on the server.
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <p className="text-sm text-slate-400">Active employees</p>
          <p className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {billing.employee_count}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Active employee profiles assigned to this organization.
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 sm:p-6 ${
            billing.billing_overdue
              ? "border-rose-500/70 bg-rose-950/40 motion-safe:animate-pulse"
              : "border-slate-800 bg-slate-900"
          }`}
        >
          <p
            className={`text-sm ${
              billing.billing_overdue ? "text-rose-300" : "text-slate-400"
            }`}
          >
            {billing.billing_overdue ? "OVERDUE BALANCE" : "Outstanding balance"}
          </p>
          <p
            className={`mt-2 text-2xl font-bold sm:text-3xl ${
              billing.billing_overdue ? "text-rose-400" : "text-white"
            }`}
          >
            {formatMoney(billing.total_due)}
          </p>
          <p
            className={`mt-2 text-xs ${
              billing.billing_overdue ? "text-rose-200/80" : "text-slate-500"
            }`}
          >
            Cumulative unpaid invoices through{" "}
            {formatDate(invoice.due_at)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <p className="text-sm text-slate-400">Latest monthly invoice</p>
          <p className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {formatMoney(invoice.amount)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {invoice.employee_count} employees ×{" "}
            {formatMoney(invoice.price_per_employee)}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="break-words text-base font-semibold text-white sm:text-lg">
              {formatDate(invoice.period_start)} – {formatDate(invoice.due_at)}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Due {formatDate(invoice.due_at)} · 7-day grace period ends{" "}
              {formatDate(invoice.grace_ends_at)}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[invoice.status] || "bg-slate-700 text-slate-200"}`}
          >
            {invoice.status}
          </span>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-rose-400">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-4 text-sm text-emerald-400">
            {message}
          </p>
        )}

        {Number(billing.total_due) > 0 && (
          <form
            onSubmit={handlePayment}
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
            <label className="sr-only" htmlFor="billingPhoneNumber">
              M-Pesa phone number
            </label>
            <input
              id="billingPhoneNumber"
              type="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="M-Pesa number (e.g. 0712345678)"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-emerald-500"
              required
            />
            {paymentPending ? (
              <button
                type="button"
                onClick={handleCheckStatus}
                disabled={working}
                className="rounded-lg bg-blue-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {working ? "Checking…" : "Check payment status"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={working || !billing.payment_configured}
                className="rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {working ? "Sending prompt…" : "Pay with M-Pesa"}
              </button>
            )}
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-5">
          <h2 className="font-semibold text-white">Recent invoices</h2>
        </div>
        <div className="divide-y divide-slate-800 lg:hidden">
          {billing.invoices.map((item) => (
            <article key={item.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400">Period</p>
                  <p className="mt-1 text-sm text-white">
                    {formatDate(item.period_start)} – {formatDate(item.period_end)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[item.status] || "bg-slate-700 text-slate-200"}`}
                >
                  {item.status}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Employees</dt>
                  <dd className="mt-1 text-slate-200">{item.employee_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Amount</dt>
                  <dd className="mt-1 text-slate-200">{formatMoney(item.amount)}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-slate-400">M-Pesa reference</dt>
                  <dd className="mt-1 break-all text-slate-200">
                    {item.transaction_reference || "—"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-950/70 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">Employees</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">M-Pesa reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {billing.invoices.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4">
                    {formatDate(item.period_start)} – {formatDate(item.period_end)}
                  </td>
                  <td className="px-5 py-4">{item.employee_count}</td>
                  <td className="px-5 py-4">{formatMoney(item.amount)}</td>
                  <td className="px-5 py-4">{item.status}</td>
                  <td className="px-5 py-4">
                    {item.transaction_reference || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
