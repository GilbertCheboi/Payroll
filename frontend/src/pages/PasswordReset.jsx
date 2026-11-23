import React, { useState } from "react";
import API from "../api";

function getErrorMessage(error, fallback) {
  const details = error.response?.data;
  if (details?.detail) return details.detail;
  const fieldError = Object.values(details || {})
    .flat()
    .find((value) => typeof value === "string");
  return fieldError || fallback;
}

export default function PasswordReset({
  mode,
  uid,
  token,
  onBack,
  onCompleted,
  onPhoneVerified,
}) {
  const [method, setMethod] = useState("email");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const isConfirmation = mode === "confirm";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (isConfirmation) {
        if (newPassword !== confirmPassword) {
          setError("The passwords do not match.");
          return;
        }
        await API.post("auth/password-reset/confirm/", {
          uid,
          token,
          new_password: newPassword,
        });
        setMessage("Your password has been reset. You can now sign in.");
      } else if (method === "email") {
        const response = await API.post("auth/password-reset/", { email });
        setMessage(response.data.detail);
      } else if (!codeSent) {
        const response = await API.post("auth/password-reset/phone/", {
          phone_number: phoneNumber,
        });
        setCodeSent(true);
        setMessage(response.data.detail);
      } else {
        const response = await API.post(
          "auth/password-reset/phone/verify/",
          { phone_number: phoneNumber, code },
        );
        await onPhoneVerified(response.data.access);
      }
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Unable to reset your password. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h1 className="mb-2 text-2xl font-bold text-white">
          {isConfirmation ? "Choose a new password" : "Forgot your password?"}
        </h1>
        <p className="mb-6 text-sm text-slate-400">
          {isConfirmation
            ? "Enter and confirm the new password for your account."
            : "Choose how you want to verify your account before resetting your password."}
        </p>
        {message && (isConfirmation || method === "email") ? (
          <div
            role="status"
            className="space-y-4 text-sm text-emerald-300"
          >
            <p>{message}</p>
            <button
              type="button"
              onClick={isConfirmation ? onCompleted : onBack}
              className="w-full rounded bg-emerald-500 p-3 font-semibold text-slate-900 hover:bg-emerald-600"
            >
              {isConfirmation ? "Return to sign in" : "Back to sign in"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isConfirmation ? (
              <>
                <div>
                  <label
                    htmlFor="new-password"
                    className="mb-1 block text-xs uppercase tracking-widest text-slate-400"
                  >
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-sm text-white"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="confirm-password"
                    className="mb-1 block text-xs uppercase tracking-widest text-slate-400"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-sm text-white"
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-xs uppercase tracking-widest text-slate-400">
                    Send verification by
                  </legend>
                  {[
                    ["email", "Email reset link"],
                    ["phone", "Phone verification code"],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-3 rounded border border-slate-800 bg-slate-950 p-3 text-sm text-white"
                    >
                      <input
                        type="radio"
                        name="reset-method"
                        value={value}
                        checked={method === value}
                        onChange={() => {
                          setMethod(value);
                          setMessage("");
                          setError("");
                          setCodeSent(false);
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                {method === "email" ? (
                  <div>
                    <label
                      htmlFor="reset-email"
                      className="mb-1 block text-xs uppercase tracking-widest text-slate-400"
                    >
                      Email
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-sm text-white"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                ) : (
                  <>
                    {!codeSent ? (
                      <div>
                        <label
                          htmlFor="reset-phone"
                          className="mb-1 block text-xs uppercase tracking-widest text-slate-400"
                        >
                          Phone number
                        </label>
                        <input
                          id="reset-phone"
                          type="tel"
                          autoComplete="tel"
                          value={phoneNumber}
                          onChange={(event) =>
                            setPhoneNumber(event.target.value)
                          }
                          className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-sm text-white"
                          placeholder="0700236628"
                          required
                        />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-slate-300" role="status">
                          {message} Enter the 6-digit code sent to your phone.
                        </p>
                        <div>
                          <label
                            htmlFor="reset-code"
                            className="mb-1 block text-xs uppercase tracking-widest text-slate-400"
                          >
                            Verification code
                          </label>
                          <input
                            id="reset-code"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            value={code}
                            onChange={(event) =>
                              setCode(event.target.value.replace(/\D/g, ""))
                            }
                            className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-sm text-white"
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCodeSent(false);
                            setCode("");
                            setMessage("");
                          }}
                          className="w-full text-sm text-slate-400 hover:text-white"
                        >
                          Use a different phone number
                        </button>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-rose-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-emerald-500 p-3 font-semibold text-slate-900 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait…"
                : isConfirmation
                  ? "Reset password"
                  : method === "email"
                    ? "Send reset link"
                    : codeSent
                      ? "Verify code and open profile"
                      : "Send verification code"}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full text-sm text-slate-400 hover:text-white"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
