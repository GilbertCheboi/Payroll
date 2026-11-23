import React, { useCallback, useEffect, useState } from "react";
import API from "../api";

const leaveTypes = [
  ["ANNUAL", "Annual leave"],
  ["SICK", "Sick leave"],
  ["PERSONAL", "Personal leave"],
  ["MATERNITY", "Maternity leave"],
  ["PATERNITY", "Paternity leave"],
  ["UNPAID", "Unpaid leave"],
  ["OTHER", "Other"],
];

const statusStyles = {
  PENDING: "bg-amber-400/10 text-amber-300",
  APPROVED: "bg-emerald-400/10 text-emerald-300",
  REJECTED: "bg-rose-400/10 text-rose-300",
};

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]";

export default function Leaves({ userRole, dashboardPreview = false, onNavigate }) {
  const isEmployee = userRole === "EMPLOYEE";
  const [requests, setRequests] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    leave_type: "ANNUAL",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const loadRequests = useCallback(async (requestedPage = 1) => {
    setError("");
    try {
      const statusFilter = dashboardPreview ? "&status=PENDING" : "";
      const response = await API.get(
        `leaves/?page=${requestedPage}${statusFilter}`,
      );
      const data = response.data;
      setRequests(Array.isArray(data) ? data : data?.results || []);
      setPage(requestedPage);
      setHasNextPage(Boolean(data?.next));
    } catch (requestError) {
      console.error("Failed to load leave requests.", requestError);
      setError("Unable to load leave requests. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [dashboardPreview]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await API.post("leaves/", form);
      setForm({
        leave_type: "ANNUAL",
        start_date: "",
        end_date: "",
        reason: "",
      });
      setMessage("Your leave request has been submitted.");
      await loadRequests(1);
    } catch (requestError) {
      console.error("Leave request submission failed.", requestError);
      const details = requestError.response?.data;
      const detailMessage =
        details?.detail ||
        Object.values(details || {})
          .flat()
          .find((value) => typeof value === "string");
      setError(detailMessage || "Unable to submit your request. Please check the dates and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const reviewRequest = async (id, decision) => {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      await API.post(`leaves/${id}/${decision}/`, {});
      setMessage(`Leave request ${decision === "approve" ? "approved" : "rejected"}.`);
      await loadRequests(page);
    } catch (requestError) {
      console.error("Leave request review failed.", requestError);
      setError(
        requestError.response?.data?.detail ||
          "Unable to update this leave request. Please refresh and try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-white">
      {!dashboardPreview && (
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
            People
          </p>
          <h1 className="mt-2 text-3xl font-black">Leave requests</h1>
          <p className="mt-2 text-sm text-slate-400">
            {isEmployee
              ? "Apply for time away and keep track of your requests."
              : "Review and manage leave requests across your organization."}
          </p>
        </header>
      )}

      {(error || message) && (
        <div
          role={error ? "alert" : "status"}
          className={`rounded-xl border p-4 text-sm ${
            error
              ? "border-rose-900 bg-rose-950/50 text-rose-200"
              : "border-emerald-900 bg-emerald-950/40 text-emerald-200"
          }`}
        >
          {error || message}
        </div>
      )}

      {isEmployee && !dashboardPreview && (
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6"
        >
          <h2 className="text-lg font-bold">Apply for leave</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm text-slate-300">
              Leave type
              <select
                className={inputClass}
                value={form.leave_type}
                onChange={(event) =>
                  setForm({ ...form, leave_type: event.target.value })
                }
              >
                {leaveTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              Start date
              <input
                type="date"
                className={inputClass}
                value={form.start_date}
                onChange={(event) =>
                  setForm({ ...form, start_date: event.target.value })
                }
                required
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              End date
              <input
                type="date"
                className={inputClass}
                value={form.end_date}
                onChange={(event) =>
                  setForm({ ...form, end_date: event.target.value })
                }
                min={form.start_date || undefined}
                required
              />
            </label>
          </div>
          <label className="block space-y-2 text-sm text-slate-300">
            Reason
            <textarea
              className={inputClass}
              rows={3}
              maxLength={2000}
              value={form.reason}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
              placeholder="Add a short explanation for your request"
              required
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg px-5 py-2.5 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="font-bold">
              {dashboardPreview
                ? "Pending leave requests"
                : isEmployee
                  ? "My requests"
                  : "Organization requests"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {dashboardPreview
                ? "Review employee time-off applications."
                : "Leave duration is counted in inclusive calendar days."}
            </p>
          </div>
          {dashboardPreview && (
            <button
              type="button"
              onClick={() => onNavigate?.("leaves")}
              className="text-sm font-semibold"
              style={{ color: "var(--accent)" }}
            >
              View all requests
            </button>
          )}
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-400">Loading leave requests…</p>
        ) : requests.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">
            No leave requests to display.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  {!isEmployee && <th className="px-5 py-3">Employee</th>}
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Dates</th>
                  <th className="px-5 py-3">Days</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Status</th>
                  {!isEmployee && <th className="px-5 py-3">Review</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {requests.map((request) => (
                  <tr key={request.id} className="align-top">
                    {!isEmployee && (
                      <td className="px-5 py-4">
                        <p className="font-semibold text-white">
                          {request.employee_name || "Employee"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {request.employee_id}
                          {request.department_name
                            ? ` · ${request.department_name}`
                            : ""}
                        </p>
                      </td>
                    )}
                    <td className="px-5 py-4 text-slate-200">
                      {leaveTypes.find(([value]) => value === request.leave_type)?.[1] ||
                        request.leave_type}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-300">
                      {request.start_date} – {request.end_date}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {request.days_requested}
                    </td>
                    <td className="max-w-xs whitespace-normal px-5 py-4 text-slate-400">
                      {request.reason}
                      {request.review_note && (
                        <p className="mt-2 text-xs text-slate-500">
                          Review note: {request.review_note}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          statusStyles[request.status] || "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    {!isEmployee && (
                      <td className="px-5 py-4">
                        {request.status === "PENDING" ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => reviewRequest(request.id, "approve")}
                              disabled={busyId === request.id}
                              className="rounded-md bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => reviewRequest(request.id, "reject")}
                              disabled={busyId === request.id}
                              className="rounded-md bg-rose-500/15 px-2.5 py-1.5 text-xs font-semibold text-rose-300 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {request.reviewed_by_name || "Reviewed"}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && requests.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-800 px-6 py-3 text-xs text-slate-400">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => loadRequests(page - 1)}
                disabled={page === 1}
                className="rounded-md border border-slate-700 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => loadRequests(page + 1)}
                disabled={!hasNextPage}
                className="rounded-md border border-slate-700 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
