// frontend/src/Departments.jsx
import React, { useState, useEffect } from "react";
import API from "./api";

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingCode, setEditingCode] = useState("");
  const [msg, setMsg] = useState("");

  const fetchDepartments = async () => {
    try {
      const res = await API.get("departments/");

      // DEFENSIVE: Ensure we parse the API response safely into an array.
      // This automatically handles raw arrays, paginated arrays (.results), or wrapped arrays (.data).
      const departmentsData = Array.isArray(res.data)
        ? res.data
        : res.data?.results || res.data?.data || [];

      setDepartments(departmentsData);
    } catch (err) {
      console.error("Failed to load organizational departments.", err);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await API.post("departments/", { name, code });
      setName("");
      setCode("");
      setMsg("Department created successfully!");
      fetchDepartments();
    } catch (err) {
      setMsg("Failed to create department. Verify unique codes.");
    }
  };

  const startEditing = (department) => {
    setEditingId(department.id);
    setEditingName(department.name);
    setEditingCode(department.code);
    setMsg("");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName("");
    setEditingCode("");
  };

  const handleUpdate = async (e, departmentId) => {
    e.preventDefault();
    try {
      await API.patch(`departments/${departmentId}/`, {
        name: editingName,
        code: editingCode,
      });
      cancelEditing();
      setMsg("Department updated successfully!");
      fetchDepartments();
    } catch (err) {
      setMsg("Failed to update department. Verify unique codes.");
    }
  };

  const handleDelete = async (department) => {
    if (!window.confirm(`Delete ${department.name}?`)) return;
    try {
      await API.delete(`departments/${department.id}/`);
      if (editingId === department.id) cancelEditing();
      setMsg("Department deleted successfully!");
      fetchDepartments();
    } catch (err) {
      setMsg(
        "Failed to delete department. It may still have employees assigned.",
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Creation Form */}
      <form
        onSubmit={handleCreate}
        className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-md"
      >
        <h3 className="text-xl font-extrabold text-white">
          Register New Department
        </h3>
        {msg && <p className="text-sm font-semibold text-emerald-300">{msg}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Department Name (e.g., Engineering)"
            className="p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Code (e.g., ENG)"
            className="p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white outline-none"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 px-4 py-2 rounded-lg font-semibold transition shadow-sm"
        >
          Add Department
        </button>
      </form>

      {/* List View Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider">
              <th className="p-4">Code</th>
              <th className="p-4">Department Name</th>
              <th className="p-4">Assigned Manager</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {/* SAFE GUARDED: Loop falls back to empty array if state is somehow invalid */}
            {(departments || []).map((dept) => (
              <tr key={dept.id} className="hover:bg-slate-800/50 transition">
                {editingId === dept.id ? (
                  <td colSpan="4" className="p-4">
                    <form
                      onSubmit={(e) => handleUpdate(e, dept.id)}
                      className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2"
                    >
                      <input
                        value={editingCode}
                        onChange={(e) => setEditingCode(e.target.value)}
                        className="p-2 bg-slate-950 border border-slate-700 rounded text-white"
                        aria-label="Department code"
                        required
                      />
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="p-2 bg-slate-950 border border-slate-700 rounded text-white"
                        aria-label="Department name"
                        required
                      />
                      <button
                        type="submit"
                        className="px-3 py-2 rounded bg-emerald-500 text-slate-900 font-semibold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="px-3 py-2 rounded border border-slate-600 text-slate-200"
                      >
                        Cancel
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="p-4 font-mono text-blue-400">{dept.code}</td>
                    <td className="p-4 text-white font-medium">{dept.name}</td>
                    <td className="p-4 text-slate-400">
                      {dept.manager_detail
                        ? `${dept.manager_detail.first_name} ${dept.manager_detail.last_name}`
                        : "Unassigned"}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEditing(dept)}
                        className="mr-3 text-emerald-300 hover:text-emerald-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(dept)}
                        className="text-red-300 hover:text-red-200"
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
