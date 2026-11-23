import React from "react";

export default function Navbar({ onMenuClick }) {
  return (
    <header
      className="h-14 bg-slate-900 border-b flex items-center px-6"
      style={{ borderColor: "var(--accent-border)" }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        className="mr-3 rounded p-2 text-slate-300 hover:bg-slate-800 hover:text-white md:hidden"
        aria-label="Open navigation menu"
      >
        <span aria-hidden="true" className="text-xl leading-none">&#9776;</span>
      </button>
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 rounded flex items-center justify-center font-bold text-slate-900"
          style={{ backgroundColor: "var(--accent)" }}
        >
          P
        </div>
        <div className="font-extrabold" style={{ color: "var(--accent)" }}>
          PayrollMatrix
        </div>
      </div>
    </header>
  );
}
