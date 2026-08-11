import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Plus, Upload, Download, Filter, X, Trash2, Pencil, LayoutDashboard,
  Table2, FileBarChart, Users, Search, AlertCircle, Check, LogOut,
  ShieldCheck, KeyRound, Ban, RotateCcw, Wallet, Landmark, Banknote,
  ArrowDownCircle, ArrowLeftRight, Building2,
} from "lucide-react";
import Papa from "papaparse";
import { supabase, functionsUrl } from "./supabaseClient";

/* ---------------------------------- tokens --------------------------------- */
const INK = "#16233F", PAPER = "#F7F5EF", LINE = "#D7DECB", BRASS = "#9C7A3C";
const FOREST = "#2F6F5E", RUST = "#B5453D", SLATE = "#5B6472", AMBER = "#B08A2E";

const SALARY_CATEGORIES = ["Base Salary", "Overtime", "Bonus", "Commission", "Benefits", "Reimbursement"];
const OP_CATEGORIES = [
  "Vendor Payment", "Supplies & Materials", "Utilities", "Rent & Facilities",
  "Software & Subscriptions", "Travel", "Equipment", "Marketing", "Professional Services", "Other",
];
const PAYMENT_METHODS = ["Bank Transfer", "Check", "Cash", "Credit Card", "Wire Transfer"];
const STATUSES = ["Paid", "Pending", "Overdue", "Scheduled"];
const ROLES = ["Admin", "Accountant", "Viewer"];
const FUND_TYPES = ["Bank", "Cash", "Other"];

const uid = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtMoney = (n) => (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtMonth = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const monthKey = (iso) => iso.slice(0, 7);

function getErrorMessage(error, fallback = "Request failed") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  const parts = [error.message, error.details, error.hint].filter((part) => typeof part === "string" && part.trim());
  if (parts.length) return parts.join(" â€” ");
  if (error.code) return `${fallback} (code ${error.code})`;
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

const emptyForm = (dept) => ({
  id: null, type: "Operational", date: todayISO(), department: dept || "",
  payee: "", category: OP_CATEGORIES[0], amount: "", currency: "USD",
  paymentMethod: PAYMENT_METHODS[0], status: "Paid", notes: "", fundLocationId: "",
});

async function callFn(action, payload, accessToken) {
  const res = await fetch(`${functionsUrl}/create-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw }; }
  if (!res.ok) {
    const message = getErrorMessage(data.error, raw || `Request failed (${res.status})`);
    if (res.status === 404) throw new Error("The create-user Supabase Edge Function is not deployed.");
    throw new Error(message);
  }
  return data;
}

/* --------------------------------- small UI bits ------------------------------ */
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-sm shadow-lg text-sm flex items-center gap-2 max-w-[90%] text-center"
      style={{ background: toast.type === "error" ? RUST : INK, color: PAPER }}>
      {toast.type === "error" ? <AlertCircle size={15} /> : <Check size={15} />}
      {toast.msg}
    </div>
  );
}
function ApiAlert({ message }) {
  if (!message) return null;
  return (
    <div role="alert" aria-live="assertive" className="border rounded-sm px-3 py-2.5 text-xs leading-relaxed flex items-start gap-2" style={{ borderColor: RUST, background: "#FFF4F2", color: RUST }}>
      <AlertCircle size={15} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
function Stamp({ status }) {
  const map = { Paid: { c: FOREST, r: "-1.5deg" }, Pending: { c: AMBER, r: "1deg" }, Overdue: { c: RUST, r: "-1deg" }, Scheduled: { c: SLATE, r: "1.5deg" } };
  const s = map[status] || map.Pending;
  return (
    <span className="inline-block px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase border-2 rounded-sm"
      style={{ color: s.c, borderColor: s.c, transform: `rotate(${s.r})`, fontFamily: "ui-monospace, monospace" }}>
      {status}
    </span>
  );
}
function FundIcon({ type, size = 13, color }) {
  if (type === "Bank") return <Landmark size={size} color={color} />;
  if (type === "Cash") return <Banknote size={size} color={color} />;
  return <Wallet size={size} color={color} />;
}
function Field({ label, children }) {
  return <div><label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: SLATE }}>{label}</label>{children}</div>;
}
function Select({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select value={value} onChange={onChange} className="w-full border rounded-sm px-2 py-1.5 text-xs bg-white" style={{ borderColor: LINE }}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </Field>
  );
}
function Kpi({ label, value, accent }) {
  return (
    <div className="border rounded-sm p-3 bg-white" style={{ borderColor: LINE, borderLeft: `3px solid ${accent}` }}>
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: SLATE }}>{label}</div>
      <div className="text-lg font-semibold" style={{ fontFamily: "ui-monospace, monospace" }}>{value}</div>
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div className="border rounded-sm p-3 bg-white" style={{ borderColor: LINE }}>
      <div className="text-xs uppercase tracking-wider mb-2" style={{ color: BRASS, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}
function Empty() { return <div className="text-xs py-8 text-center" style={{ color: SLATE }}>No records yet â€” add an entry or import a CSV.</div>; }

/* ==================================== APP ===================================== */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [firstRun, setFirstRun] = useState(undefined); // undefined = checking, true/false once known
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [fundLocations, setFundLocations] = useState([]);
  const [fundTransactions, setFundTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [showImport, setShowImport] = useState(false);
  const [reportType, setReportType] = useState("monthly");
  const [showFilters, setShowFilters] = useState(false);
  const [showFundModal, setShowFundModal] = useState(null);
  const [depositFor, setDepositFor] = useState(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [filters, setFilters] = useState({ from: "", to: "", type: "All", department: "All", category: "All", status: "All", fund: "All", search: "" });

  const [dataError, setDataError] = useState(null);
  const [setupError, setSetupError] = useState(null);
  const showToast = useCallback((msg, type = "ok") => { setToast({ msg: getErrorMessage(msg), type }); setTimeout(() => setToast(null), 6000); }, []);

  /* ---- auth session ---- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        showToast(getErrorMessage(error, "Could not connect to Supabase"), "error");
        setSession(null);
        return;
      }
      setSession(data.session ?? null);
    }).catch((error) => {
      showToast(getErrorMessage(error, "Could not connect to Supabase"), "error");
      setSession(null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [showToast]);

  /* ---- check whether this is a brand-new install (no accounts yet) ---- */
  useEffect(() => {
    if (session) return; // only relevant while signed out
    (async () => {
      const { data, error } = await supabase.rpc("is_first_run");
      if (error) {
        setSetupError(getErrorMessage(error, "Could not check setup status"));
        setFirstRun(false);
        return;
      }
      setSetupError(null);
      setFirstRun(!!data);
    })();
  }, [session]);

  /* ---- load my profile once signed in ---- */
  useEffect(() => {
    if (!session) { setProfile(null); return; }
    (async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (error || !data || !data.active) {
        showToast(error ? getErrorMessage(error, "Could not load your profile") : "Your account is inactive â€” contact an Admin", "error");
        await supabase.auth.signOut();
        return;
      }
      setProfile(data);
    })();
  }, [session, showToast]);

  /* ---- load shared data once we have an active profile ---- */
  const loadAll = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    const [p, d, fl, ft, ex] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("departments").select("*").order("name"),
      supabase.from("fund_locations").select("*").order("created_at"),
      supabase.from("fund_transactions").select("*").order("date", { ascending: false }),
      supabase.from("expenses").select("*").order("date", { ascending: false }),
    ]);
    const failed = [p, d, fl, ft, ex].find((result) => result.error);
    if (failed) {
      setDataError(getErrorMessage(failed.error, "Could not load ledger data"));
      setLoadingData(false);
      return;
    }
    if (p.data) setProfiles(p.data);
    if (d.data) setDepartments(d.data.map((r) => r.name));
    if (fl.data) setFundLocations(fl.data.map((f) => ({ id: f.id, name: f.name, type: f.type, openingBalance: f.opening_balance })));
    if (ft.data) setFundTransactions(ft.data.map((t) => ({ id: t.id, locationId: t.location_id, amount: Number(t.amount), type: t.type, transferId: t.transfer_id, counterpartyName: t.counterparty_name, date: t.date, notes: t.notes, addedByUsername: t.added_by })));
    if (ex.data) setExpenses(ex.data.map((e) => ({
      id: e.id, type: e.type, date: e.date, department: e.department, payee: e.payee, category: e.category,
      amount: Number(e.amount), currency: e.currency, paymentMethod: e.payment_method, status: e.status,
      fundLocationId: e.fund_location_id, notes: e.notes, addedByUsername: e.added_by,
    })));
    setLoadingData(false);
  }, []);

  useEffect(() => { if (profile) loadAll(); }, [profile, loadAll]);

  const nameFor = useCallback((userId) => profiles.find((p) => p.id === userId)?.name || "Unknown", [profiles]);

  const canEdit = profile?.role === "Admin" || profile?.role === "Accountant";
  const isAdmin = profile?.role === "Admin";

  /* ---- fund balances ---- */
  const balances = useMemo(() => {
    const map = {};
    fundLocations.forEach((loc) => { map[loc.id] = Number(loc.openingBalance) || 0; });
    fundTransactions.forEach((t) => { if (map[t.locationId] !== undefined) map[t.locationId] += t.amount; });
    expenses.forEach((e) => { if (e.fundLocationId && map[e.fundLocationId] !== undefined) map[e.fundLocationId] -= e.amount; });
    return map;
  }, [fundLocations, fundTransactions, expenses]);
  const totalBalance = useMemo(() => Object.values(balances).reduce((s, v) => s + v, 0), [balances]);

  /* ---- mutations ---- */
  const addDepartment = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("departments").insert({ name: trimmed, created_by: profile.id });
    if (error) { const message = getErrorMessage(error); showToast(message.toLowerCase().includes("duplicate") ? "That department already exists" : message, "error"); return; }
    showToast(`Department "${trimmed}" added`);
    loadAll();
  };
  const removeDepartment = async (name) => {
    if (departments.length <= 1) { showToast("Keep at least one department", "error"); return; }
    if (expenses.some((e) => e.department === name)) { showToast("Can't remove â€” expenses are recorded under this department", "error"); return; }
    const { error } = await supabase.from("departments").delete().eq("name", name);
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    showToast(`Department "${name}" removed`);
    loadAll();
  };

  const createFundLocation = async (loc) => {
    const { error } = await supabase.from("fund_locations").insert({ name: loc.name, type: loc.type, opening_balance: loc.openingBalance, created_by: profile.id });
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    showToast(`Account "${loc.name}" created`);
    setShowFundModal(null);
    loadAll();
  };
  const deleteFundLocation = async (id) => {
    if (expenses.some((e) => e.fundLocationId === id)) { showToast("Can't remove â€” expenses are recorded against this account", "error"); return; }
    const { error } = await supabase.from("fund_locations").delete().eq("id", id);
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    showToast("Account removed");
    loadAll();
  };
  const recordDeposit = async ({ locationId, amount, date, notes }) => {
    const { error } = await supabase.from("fund_transactions").insert({ location_id: locationId, amount, type: "Deposit", date, notes, added_by: profile.id });
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    showToast("Funds added");
    setShowFundModal(null); setDepositFor(null);
    loadAll();
  };
  const recordTransfer = async ({ fromId, toId, amount, date, notes }) => {
    const fromLoc = fundLocations.find((f) => f.id === fromId);
    const toLoc = fundLocations.find((f) => f.id === toId);
    const transferId = uid();
    const { error } = await supabase.from("fund_transactions").insert([
      { location_id: fromId, amount: -Math.abs(amount), type: "Transfer", transfer_id: transferId, counterparty_name: toLoc?.name, date, notes, added_by: profile.id },
      { location_id: toId, amount: Math.abs(amount), type: "Transfer", transfer_id: transferId, counterparty_name: fromLoc?.name, date, notes, added_by: profile.id },
    ]);
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    showToast(`Transferred ${fmtMoney(amount)} from ${fromLoc?.name} to ${toLoc?.name}`);
    setShowFundModal(null);
    loadAll();
  };

  const openAdd = () => { setForm({ ...emptyForm(departments[0]), fundLocationId: fundLocations[0]?.id || "" }); setShowForm(true); };
  const openEdit = (exp) => { setForm({ ...exp, amount: String(exp.amount) }); setShowForm(true); };

  const submitForm = async () => {
    if (!form.payee.trim() || !form.amount || Number(form.amount) <= 0) { showToast("Payee and a valid amount are required", "error"); return; }
    if (fundLocations.length > 0 && !form.fundLocationId) { showToast("Select which account these funds come from", "error"); return; }
    const row = {
      type: form.type, date: form.date, department: form.department, payee: form.payee.trim(),
      category: form.category, amount: Number(form.amount), currency: form.currency,
      payment_method: form.paymentMethod, status: form.status, fund_location_id: form.fundLocationId || null,
      notes: form.notes,
    };
    let error;
    if (form.id) {
      ({ error } = await supabase.from("expenses").update({ ...row, updated_by: profile.id }).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("expenses").insert({ ...row, added_by: profile.id }));
    }
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    setShowForm(false);
    showToast(form.id ? "Entry updated" : "Entry recorded");
    loadAll();
  };
  const deleteEntry = async (id) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    showToast("Entry deleted");
    loadAll();
  };

  const handleCsv = (file) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const norm = (o, keys) => { for (const k of Object.keys(o)) if (keys.includes(k.trim().toLowerCase())) return o[k]; return ""; };
        const rows = res.data.map((r) => {
          const type = (norm(r, ["type"]) || "Operational").toLowerCase().startsWith("sal") ? "Salary" : "Operational";
          const amount = Number(String(norm(r, ["amount", "amt"])).replace(/[^0-9.-]/g, "")) || 0;
          const date = norm(r, ["date"]) || todayISO();
          const fundName = norm(r, ["funding source", "account", "fund", "location"]);
          const matched = fundLocations.find((f) => f.name.toLowerCase() === String(fundName).toLowerCase());
          return {
            type, date: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : todayISO(),
            department: norm(r, ["department", "dept"]) || departments[0],
            payee: norm(r, ["payee", "employee", "vendor", "name"]) || "Unknown",
            category: norm(r, ["category"]) || (type === "Salary" ? SALARY_CATEGORIES[0] : OP_CATEGORIES[0]),
            amount, currency: norm(r, ["currency"]) || "USD",
            payment_method: norm(r, ["payment method", "method"]) || PAYMENT_METHODS[0],
            status: norm(r, ["status"]) || "Paid",
            fund_location_id: matched ? matched.id : (fundLocations[0]?.id || null),
            notes: norm(r, ["notes", "note"]) || "", added_by: profile.id,
          };
        }).filter((r) => r.amount > 0);
        if (rows.length === 0) { showToast("No valid rows found in file", "error"); return; }
        const { error } = await supabase.from("expenses").insert(rows);
        if (error) { showToast(getErrorMessage(error), "error"); return; }
        showToast(`Imported ${rows.length} entries`);
        setShowImport(false);
        loadAll();
      },
      error: () => showToast("Could not parse that file", "error"),
    });
  };

  /* ---- team management ---- */
  const createUser = async ({ email, password, name, role }) => {
    try {
      await callFn("create", { email, password, name, role }, session.access_token);
      showToast(`Account created for ${name}`);
      loadAll();
    } catch (e) { showToast(getErrorMessage(e), "error"); }
  };
  const resetUserPassword = async (userId, newPassword) => {
    try {
      await callFn("reset_password", { userId, newPassword }, session.access_token);
      showToast("Password reset");
    } catch (e) { showToast(getErrorMessage(e), "error"); }
  };
  const changeRole = async (id, role) => {
    const activeAdmins = profiles.filter((p) => p.role === "Admin" && p.active).length;
    const target = profiles.find((p) => p.id === id);
    if (target.role === "Admin" && role !== "Admin" && activeAdmins <= 1) { showToast("At least one active Admin is required", "error"); return; }
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    loadAll();
  };
  const toggleActive = async (id) => {
    const target = profiles.find((p) => p.id === id);
    const activeAdmins = profiles.filter((p) => p.role === "Admin" && p.active).length;
    if (target.id === profile.id) { showToast("You can't deactivate your own account", "error"); return; }
    if (target.role === "Admin" && target.active && activeAdmins <= 1) { showToast("At least one active Admin is required", "error"); return; }
    const { error } = await supabase.from("profiles").update({ active: !target.active }).eq("id", id);
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    showToast(target.active ? "Account deactivated" : "Account reactivated");
    loadAll();
  };

  /* ---- filtering & derived data ---- */
  const filtered = useMemo(() => expenses.filter((e) => {
    if (filters.from && e.date < filters.from) return false;
    if (filters.to && e.date > filters.to) return false;
    if (filters.type !== "All" && e.type !== filters.type) return false;
    if (filters.department !== "All" && e.department !== filters.department) return false;
    if (filters.category !== "All" && e.category !== filters.category) return false;
    if (filters.status !== "All" && e.status !== filters.status) return false;
    if (filters.fund !== "All" && e.fundLocationId !== filters.fund) return false;
    if (filters.search && !`${e.payee} ${e.notes}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (a.date < b.date ? 1 : -1)), [expenses, filters]);

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && v !== "All").length;
  const resetFilters = () => setFilters({ from: "", to: "", type: "All", department: "All", category: "All", status: "All", fund: "All", search: "" });

  const stats = useMemo(() => {
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    const salary = filtered.filter((e) => e.type === "Salary").reduce((s, e) => s + e.amount, 0);
    const op = filtered.filter((e) => e.type === "Operational").reduce((s, e) => s + e.amount, 0);
    const pending = filtered.filter((e) => e.status === "Pending" || e.status === "Overdue").reduce((s, e) => s + e.amount, 0);
    return { total, salary, op, pending, count: filtered.length };
  }, [filtered]);

  const monthlyTrend = useMemo(() => {
    const map = {};
    filtered.forEach((e) => { const k = monthKey(e.date); map[k] = map[k] || { month: k, Salary: 0, Operational: 0 }; map[k][e.type] += e.amount; });
    return Object.values(map).sort((a, b) => (a.month > b.month ? 1 : -1)).map((r) => ({ ...r, label: fmtMonth(r.month + "-01") }));
  }, [filtered]);
  const byDept = useMemo(() => {
    const map = {}; filtered.forEach((e) => { map[e.department] = (map[e.department] || 0) + e.amount; });
    return Object.entries(map).map(([department, amount]) => ({ department, amount })).sort((a, b) => b.amount - a.amount);
  }, [filtered]);
  const byCategory = useMemo(() => {
    const map = {}; filtered.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [filtered]);
  const splitPie = [{ name: "Salaries", value: stats.salary, color: INK }, { name: "Operational", value: stats.op, color: BRASS }];

  const reportRows = useMemo(() => {
    switch (reportType) {
      case "monthly": return monthlyTrend.map((r) => ({ Month: r.label, Salaries: r.Salary, Operational: r.Operational, Total: r.Salary + r.Operational }));
      case "department": return byDept.map((r) => ({ Department: r.department, Total: r.amount, "Share %": stats.total ? ((r.amount / stats.total) * 100).toFixed(1) : 0 }));
      case "category": return byCategory.map((r) => ({ Category: r.category, Total: r.amount }));
      case "salary": { const m = {}; filtered.filter((e) => e.type === "Salary").forEach((e) => { m[e.payee] = m[e.payee] || { Employee: e.payee, Department: e.department, Total: 0, Entries: 0 }; m[e.payee].Total += e.amount; m[e.payee].Entries += 1; }); return Object.values(m).sort((a, b) => b.Total - a.Total); }
      case "vendor": { const m = {}; filtered.filter((e) => e.type === "Operational").forEach((e) => { m[e.payee] = m[e.payee] || { Vendor: e.payee, Category: e.category, Total: 0, Entries: 0 }; m[e.payee].Total += e.amount; m[e.payee].Entries += 1; }); return Object.values(m).sort((a, b) => b.Total - a.Total); }
      case "pending": return filtered.filter((e) => e.status === "Pending" || e.status === "Overdue").map((e) => ({ Date: e.date, Payee: e.payee, Department: e.department, Category: e.category, Amount: e.amount, Status: e.status, Account: fundLocations.find((f) => f.id === e.fundLocationId)?.name || "" }));
      case "activity": return filtered.map((e) => ({ Date: e.date, Payee: e.payee, Amount: e.amount, "Recorded By": nameFor(e.addedByUsername) }));
      case "funds": return fundLocations.map((f) => ({ Account: f.name, Type: f.type, "Opening Balance": Number(f.openingBalance) || 0, "Current Balance": balances[f.id] || 0 }));
      case "fundActivity": {
        const inRange = fundTransactions.filter((t) => (!filters.from || t.date >= filters.from) && (!filters.to || t.date <= filters.to));
        return inRange.map((t) => ({ Date: t.date, Account: fundLocations.find((f) => f.id === t.locationId)?.name || "Unknown", Type: t.type, Amount: t.amount, Counterparty: t.counterpartyName || "", Notes: t.notes || "", "Recorded By": nameFor(t.addedByUsername) }));
      }
      default: return [];
    }
  }, [reportType, monthlyTrend, byDept, byCategory, filtered, stats.total, fundLocations, balances, fundTransactions, filters.from, filters.to, nameFor]);

  const exportCsv = (rows, filename) => {
    if (!rows.length) { showToast("Nothing to export for this view", "error"); return; }
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported");
  };

  /* ------------------------------- render gates -------------------------------- */
  if (session === undefined) {
    return <div className="h-full min-h-[500px] flex items-center justify-center" style={{ background: PAPER, fontFamily: "ui-serif, Georgia, serif", color: INK }}><div className="text-sm tracking-widest uppercase">Opening the ledgerâ€¦</div></div>;
  }
  if (!session) {
    if (firstRun === undefined) return <div className="h-full min-h-[500px] flex items-center justify-center" style={{ background: PAPER, color: INK }}><div className="text-sm">Checking setup statusâ€¦</div></div>;
    if (firstRun) return <SetupAdmin error={setupError} showToast={showToast} onDone={async (email, password) => { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) showToast(getErrorMessage(error), "error"); }} />;
    return <LoginScreen error={setupError} showToast={showToast} />;
  }
  if (!profile) {
    return <div className="h-full min-h-[500px] flex items-center justify-center" style={{ background: PAPER, color: INK }}><div className="text-sm">Loading your accountâ€¦</div></div>;
  }
  if (dataError) {
    return <div className="h-full min-h-[500px] flex items-center justify-center p-6" style={{ background: PAPER, color: INK }}><div className="w-full max-w-lg space-y-3"><div className="text-sm" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Could not load ledger data</div><ApiAlert message={dataError} /><button onClick={loadAll} className="px-3 py-2 rounded-sm text-xs font-semibold" style={{ background: INK, color: PAPER }}>Retry</button></div></div>;
  }
  if (loadingData) {
    return <div className="h-full min-h-[500px] flex items-center justify-center" style={{ background: PAPER, color: INK }}><div className="text-sm">Loading recordsâ€¦</div></div>;
  }

  return (
    <div className="min-h-[600px] w-full" style={{ background: PAPER, color: INK, fontFamily: "ui-sans-serif, system-ui, sans-serif", backgroundImage: `repeating-linear-gradient(180deg, transparent, transparent 27px, ${LINE} 28px)` }}>
      <Toast toast={toast} />
      <div className="border-b sticky top-0 z-30" style={{ borderColor: LINE, background: "rgba(247,245,239,0.92)", backdropFilter: "blur(4px)" }}>
        <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: BRASS }}>NGVS Â· Company Ledger</div>
            <h1 className="text-lg leading-tight" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Expense &amp; Payroll Register</h1>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="text-[11px] px-2.5 py-1 rounded-sm border" style={{ borderColor: LINE, color: SLATE }}>{profile.name} Â· {profile.role}</div>
            <div className="flex gap-2">
              <button onClick={() => setShowChangePw(true)} className="text-[10px] flex items-center gap-1" style={{ color: SLATE }}><KeyRound size={11} /> Password</button>
              <button onClick={() => supabase.auth.signOut()} className="text-[10px] flex items-center gap-1" style={{ color: SLATE }}><LogOut size={11} /> Log out</button>
            </div>
          </div>
        </div>
        <div className="flex px-4 gap-1 text-xs overflow-x-auto">
          {[["dashboard", "Dashboard", LayoutDashboard], ["funds", "Funds", Wallet], ["transactions", "Transactions", Table2], ["reports", "Reports", FileBarChart],
            ...(canEdit ? [["departments", "Departments", Building2]] : []), ...(isAdmin ? [["team", "Team", Users]] : [])].map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)} className="flex items-center gap-1.5 px-3 py-2 border-b-2 -mb-px font-medium tracking-wide shrink-0" style={{ borderColor: tab === key ? INK : "transparent", color: tab === key ? INK : SLATE }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {tab === "dashboard" && <Dashboard stats={stats} monthlyTrend={monthlyTrend} byDept={byDept} splitPie={splitPie} fundLocations={fundLocations} balances={balances} totalBalance={totalBalance} />}
        {tab === "funds" && <FundsTab fundLocations={fundLocations} balances={balances} totalBalance={totalBalance} fundTransactions={fundTransactions} canEdit={canEdit} isAdmin={isAdmin} setShowFundModal={setShowFundModal} setDepositFor={setDepositFor} deleteFundLocation={deleteFundLocation} nameFor={nameFor} />}
        {tab === "transactions" && (
          <Transactions filters={filters} setFilters={setFilters} showFilters={showFilters} setShowFilters={setShowFilters} activeFilterCount={activeFilterCount} resetFilters={resetFilters}
            filtered={filtered} canEdit={canEdit} isAdmin={isAdmin} fundLocations={fundLocations} departments={departments} nameFor={nameFor}
            openAdd={openAdd} openEdit={openEdit} deleteEntry={deleteEntry} setShowImport={setShowImport}
            exportCsv={() => exportCsv(filtered.map((e) => ({ Date: e.date, Type: e.type, Department: e.department, Payee: e.payee, Category: e.category, Amount: e.amount, Currency: e.currency, "Payment Method": e.paymentMethod, Status: e.status, "Funding Source": fundLocations.find((f) => f.id === e.fundLocationId)?.name || "", Notes: e.notes, "Recorded By": nameFor(e.addedByUsername) })), "transactions.csv")} />
        )}
        {tab === "reports" && <Reports reportType={reportType} setReportType={setReportType} rows={reportRows} filters={filters} setFilters={setFilters} onExport={() => exportCsv(reportRows, `report-${reportType}.csv`)} />}
        {tab === "departments" && canEdit && <DepartmentsAdmin departments={departments} expenses={expenses} isAdmin={isAdmin} addDepartment={addDepartment} removeDepartment={removeDepartment} />}
        {tab === "team" && isAdmin && <TeamAdmin profiles={profiles} currentUser={profile} createUser={createUser} resetUserPassword={resetUserPassword} changeRole={changeRole} toggleActive={toggleActive} showToast={showToast} />}
      </div>

      {showForm && <EntryForm form={form} setForm={setForm} onCancel={() => setShowForm(false)} onSubmit={submitForm} fundLocations={fundLocations} balances={balances} departments={departments} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onFile={handleCsv} />}
      {showFundModal === "new" && <FundLocationModal onClose={() => setShowFundModal(null)} onSubmit={createFundLocation} />}
      {(showFundModal === "deposit" || depositFor) && <DepositModal fundLocations={fundLocations} preselect={depositFor} onClose={() => { setShowFundModal(null); setDepositFor(null); }} onSubmit={recordDeposit} />}
      {showFundModal === "transfer" && <TransferModal fundLocations={fundLocations} balances={balances} onClose={() => setShowFundModal(null)} onSubmit={recordTransfer} />}
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} showToast={showToast} />}

      {canEdit && !["reports", "team", "funds", "departments"].includes(tab) && !showForm && !showImport && (
        <button onClick={openAdd} className="fixed bottom-5 right-5 z-30 w-12 h-12 rounded-full flex items-center justify-center shadow-lg" style={{ background: INK, color: PAPER }} aria-label="Add expense"><Plus size={22} /></button>
      )}
    </div>
  );
}

/* --------------------------------- first-run setup -------------------------------- */
function SetupAdmin({ error, showToast, onDone }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) { showToast("Fill all fields â€” password needs 6+ characters", "error"); return; }
    if (password !== confirm) { showToast("Passwords don't match", "error"); return; }
    setBusy(true);
    try {
      await callFn("bootstrap", { name: name.trim(), email: email.trim(), password });
      await onDone(email.trim(), password);
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    }
    setBusy(false);
  };

  return (
    <div className="h-full min-h-[500px] flex items-center justify-center p-6" style={{ background: PAPER, backgroundImage: `repeating-linear-gradient(180deg, transparent, transparent 27px, ${LINE} 28px)` }}>
      <div className="w-full max-w-sm border rounded-sm p-6 bg-white shadow-sm" style={{ borderColor: LINE }}>
        <div className="text-xs tracking-[0.2em] uppercase mb-1" style={{ color: BRASS }}>NGVS Â· Company Ledger Â· First-time setup</div>
        <h1 className="text-xl mb-4" style={{ fontFamily: "ui-serif, Georgia, serif", color: INK }}>Create the Admin account</h1>
        <ApiAlert message={error} />
        <div className="space-y-2.5">
          <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <input type="password" placeholder="Password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <button disabled={busy} onClick={submit} className="w-full py-2 rounded-sm text-sm font-semibold tracking-wide" style={{ background: INK, color: PAPER }}>{busy ? "Creatingâ€¦" : "Create Admin & Enter"}</button>
          <p className="text-[11px] leading-relaxed pt-1" style={{ color: SLATE }}>
            This runs once. You'll be the Admin â€” every other login for your team gets created from inside the app, under Team, once you're in.
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- change password -------------------------------- */
function ChangePasswordModal({ onClose, showToast }) {
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (password.length < 6) { showToast("Password needs 6+ characters", "error"); return; }
    if (password !== confirm) { showToast("Passwords don't match", "error"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { showToast(getErrorMessage(error), "error"); return; }
    showToast("Password updated");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(22,35,63,0.45)" }}>
      <div className="w-full max-w-sm bg-white rounded-sm p-4" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Change My Password</h2><button onClick={onClose}><X size={18} color={SLATE} /></button></div>
        <div className="space-y-2.5">
          <Field label="New password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          <Field label="Confirm new password"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          <button disabled={busy} onClick={submit} className="w-full py-2 rounded-sm text-sm font-semibold" style={{ background: INK, color: PAPER }}>{busy ? "Updatingâ€¦" : "Update Password"}</button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- login -------------------------------- */
function LoginScreen({ error: setupError, showToast }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!email.trim() || !password) { showToast("Enter your email and password", "error"); return; }
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) {
      const message = getErrorMessage(signInError, "Sign in failed");
      setError(message);
      showToast(message, "error");
    }
  };

  return (
    <div className="h-full min-h-[500px] flex items-center justify-center p-6" style={{ background: PAPER, backgroundImage: `repeating-linear-gradient(180deg, transparent, transparent 27px, ${LINE} 28px)` }}>
      <div className="w-full max-w-sm border rounded-sm p-6 bg-white shadow-sm" style={{ borderColor: LINE }}>
        <div className="text-xs tracking-[0.2em] uppercase mb-1" style={{ color: BRASS }}>NGVS Â· Company Ledger</div>
        <h1 className="text-xl mb-4" style={{ fontFamily: "ui-serif, Georgia, serif", color: INK }}>Sign in</h1>
        <div className="space-y-2.5 mb-2.5"><ApiAlert message={error || setupError} /></div>
        <div className="space-y-2.5">
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <button disabled={busy} onClick={submit} className="w-full py-2 rounded-sm text-sm font-semibold tracking-wide" style={{ background: INK, color: PAPER }}>{busy ? "Checkingâ€¦" : "Sign In"}</button>
          <p className="text-[11px] leading-relaxed pt-1" style={{ color: SLATE }}>No account? Ask your Admin to create one for you under Team.</p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- team admin ----------------------------------- */
function TeamAdmin({ profiles, currentUser, createUser, resetUserPassword, changeRole, toggleActive, showToast }) {
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [role, setRole] = useState("Accountant");
  const [resetFor, setResetFor] = useState(null); const [resetPw, setResetPw] = useState("");

  const submitNew = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) { showToast("Fill all fields â€” password needs 6+ characters", "error"); return; }
    await createUser({ email: email.trim(), password, name: name.trim(), role });
    setName(""); setEmail(""); setPassword(""); setRole("Accountant"); setShowNew(false);
  };
  const submitReset = async () => {
    if (resetPw.length < 6) { showToast("Password needs 6+ characters", "error"); return; }
    await resetUserPassword(resetFor, resetPw);
    setResetFor(null); setResetPw("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider" style={{ color: BRASS, fontWeight: 600 }}>Team Accounts</div>
        <button onClick={() => setShowNew((v) => !v)} className="text-xs px-3 py-1.5 rounded-sm border flex items-center gap-1 bg-white" style={{ borderColor: LINE }}><Plus size={13} /> New user</button>
      </div>
      {showNew && (
        <div className="border rounded-sm p-3 bg-white space-y-2" style={{ borderColor: LINE }}>
          <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <input type="password" placeholder="Temporary password (6+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          <button onClick={submitNew} className="w-full py-2 rounded-sm text-sm font-semibold" style={{ background: INK, color: PAPER }}>Create Account</button>
        </div>
      )}
      <div className="space-y-2">
        {profiles.map((u) => (
          <div key={u.id} className="border rounded-sm p-3 bg-white" style={{ borderColor: LINE, opacity: u.active ? 1 : 0.55 }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">{u.name} {u.role === "Admin" && <ShieldCheck size={13} color={BRASS} />} {!u.active && <span className="text-[10px]" style={{ color: RUST }}>(inactive)</span>}</div>
              </div>
              <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="text-xs border rounded-sm px-1.5 py-1 bg-white shrink-0" style={{ borderColor: LINE }}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            </div>
            <div className="flex gap-3 mt-2 text-[11px]">
              <button onClick={() => { setResetFor(u.id); setResetPw(""); }} className="flex items-center gap-1" style={{ color: SLATE }}><KeyRound size={12} /> Reset password</button>
              <button onClick={() => toggleActive(u.id)} className="flex items-center gap-1" style={{ color: u.active ? RUST : FOREST }}>{u.active ? <><Ban size={12} /> Deactivate</> : <><RotateCcw size={12} /> Reactivate</>}</button>
            </div>
            {resetFor === u.id && (
              <div className="mt-2 flex gap-2">
                <input type="password" placeholder="New password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} className="flex-1 border rounded-sm px-2 py-1.5 text-xs" style={{ borderColor: LINE }} />
                <button onClick={submitReset} className="text-xs px-2.5 rounded-sm" style={{ background: INK, color: PAPER }}>Save</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed pt-1" style={{ color: SLATE }}>Accounts are created and authenticated through Supabase â€” real hashed passwords, server-side enforced permissions.</p>
    </div>
  );
}

/* ------------------------------ departments admin -------------------------------- */
function DepartmentsAdmin({ departments, expenses, isAdmin, addDepartment, removeDepartment }) {
  const [name, setName] = useState("");
  const counts = useMemo(() => { const m = {}; expenses.forEach((e) => { m[e.department] = (m[e.department] || 0) + 1; }); return m; }, [expenses]);
  const submit = () => { addDepartment(name); setName(""); };
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wider" style={{ color: BRASS, fontWeight: 600 }}>Departments</div>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="New department name" className="flex-1 border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }} />
        <button onClick={submit} className="px-3 rounded-sm text-sm font-semibold flex items-center gap-1" style={{ background: INK, color: PAPER }}><Plus size={14} /> Add</button>
      </div>
      <div className="space-y-2">
        {departments.map((d) => (
          <div key={d} className="border rounded-sm p-3 bg-white flex items-center justify-between" style={{ borderColor: LINE }}>
            <div><div className="text-sm font-medium">{d}</div><div className="text-[10px]" style={{ color: SLATE }}>{counts[d] || 0} recorded {counts[d] === 1 ? "entry" : "entries"}</div></div>
            {isAdmin && <button onClick={() => removeDepartment(d)} style={{ color: RUST }}><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- funds tab ------------------------------------ */
function FundsTab({ fundLocations, balances, totalBalance, fundTransactions, canEdit, isAdmin, setShowFundModal, setDepositFor, deleteFundLocation, nameFor }) {
  return (
    <div className="space-y-3">
      <div className="border rounded-sm p-4 bg-white text-center" style={{ borderColor: LINE, borderTop: `3px solid ${INK}` }}>
        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: SLATE }}>Total Cash &amp; Bank Balance</div>
        <div className="text-2xl font-semibold" style={{ fontFamily: "ui-monospace, monospace", color: totalBalance < 0 ? RUST : INK }}>{fmtMoney(totalBalance)}</div>
      </div>
      {canEdit && (
        <div className="flex gap-2 text-xs">
          <button onClick={() => setShowFundModal("new")} className="flex-1 border rounded-sm py-2 flex items-center justify-center gap-1 bg-white" style={{ borderColor: LINE }}><Plus size={13} /> New Account</button>
          <button onClick={() => (fundLocations.length ? setShowFundModal("deposit") : setShowFundModal("new"))} className="flex-1 rounded-sm py-2 flex items-center justify-center gap-1 font-medium" style={{ background: INK, color: PAPER }}><ArrowDownCircle size={13} /> Add Funds</button>
          <button onClick={() => (fundLocations.length >= 2 ? setShowFundModal("transfer") : null)} disabled={fundLocations.length < 2} className="flex-1 border rounded-sm py-2 flex items-center justify-center gap-1 bg-white disabled:opacity-40" style={{ borderColor: LINE, color: INK }}><ArrowLeftRight size={13} /> Transfer</button>
        </div>
      )}
      {fundLocations.length === 0 ? (
        <div className="text-xs py-8 text-center border rounded-sm bg-white" style={{ color: SLATE, borderColor: LINE }}>No accounts yet. {canEdit ? "Create a bank or cash account to start tracking balances." : "Ask your Admin or Accountant to set one up."}</div>
      ) : (
        <div className="space-y-2">
          {fundLocations.map((f) => {
            const bal = balances[f.id] || 0;
            return (
              <div key={f.id} className="border rounded-sm p-3 bg-white" style={{ borderColor: LINE }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: PAPER, border: `1px solid ${LINE}` }}><FundIcon type={f.type} color={BRASS} /></div>
                    <div className="min-w-0"><div className="text-sm font-medium truncate">{f.name}</div><div className="text-[10px] uppercase tracking-wide" style={{ color: SLATE }}>{f.type}</div></div>
                  </div>
                  <div className="text-base font-semibold" style={{ fontFamily: "ui-monospace, monospace", color: bal < 0 ? RUST : INK }}>{fmtMoney(bal)}</div>
                </div>
                {canEdit && (
                  <div className="flex gap-3 mt-2 text-[11px]">
                    <button onClick={() => setDepositFor(f.id)} className="flex items-center gap-1" style={{ color: FOREST }}><ArrowDownCircle size={12} /> Add funds</button>
                    {isAdmin && <button onClick={() => deleteFundLocation(f.id)} className="flex items-center gap-1" style={{ color: RUST }}><Trash2 size={12} /> Remove</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {fundTransactions.length > 0 && (
        <div className="border rounded-sm bg-white" style={{ borderColor: LINE }}>
          <div className="text-xs uppercase tracking-wider px-3 pt-3 pb-2" style={{ color: BRASS, fontWeight: 600 }}>Recent Fund Activity</div>
          <div className="divide-y" style={{ borderColor: LINE }}>
            {fundTransactions.slice(0, 10).map((t) => {
              const loc = fundLocations.find((f) => f.id === t.locationId);
              const isTransfer = t.type === "Transfer";
              const label = isTransfer ? (t.amount < 0 ? `Transfer to ${t.counterpartyName || "account"}` : `Transfer from ${t.counterpartyName || "account"}`) : "Deposit";
              return (
                <div key={t.id} className="flex justify-between items-center px-3 py-2 text-xs">
                  <div>
                    <div className="font-medium flex items-center gap-1.5">{isTransfer && <ArrowLeftRight size={11} color={SLATE} />}{loc?.name || "Unknown account"}</div>
                    <div className="text-[10px]" style={{ color: SLATE }}>{label} Â· {t.date} Â· by {nameFor(t.addedByUsername)}{t.notes ? ` Â· ${t.notes}` : ""}</div>
                  </div>
                  <div className="font-semibold" style={{ fontFamily: "ui-monospace, monospace", color: t.amount < 0 ? RUST : FOREST }}>{t.amount < 0 ? "âˆ’" : "+"}{fmtMoney(Math.abs(t.amount))}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FundLocationModal({ onClose, onSubmit }) {
  const [name, setName] = useState(""); const [type, setType] = useState("Bank"); const [opening, setOpening] = useState("0");
  const submit = () => { if (!name.trim()) return; onSubmit({ name: name.trim(), type, openingBalance: Number(opening) || 0 }); };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(22,35,63,0.45)" }}>
      <div className="w-full max-w-sm bg-white rounded-sm p-4" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold" style={{ fontFamily: "ui-serif, Georgia, serif" }}>New Fund Account</h2><button onClick={onClose}><X size={18} color={SLATE} /></button></div>
        <div className="space-y-2.5">
          <Field label="Account name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bank of Beirut â€“ Operating" className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          <Field label="Type"><select value={type} onChange={(e) => setType(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{FUND_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Opening balance"><input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE, fontFamily: "ui-monospace, monospace" }} /></Field>
          <button onClick={submit} className="w-full py-2 rounded-sm text-sm font-semibold" style={{ background: INK, color: PAPER }}>Create Account</button>
        </div>
      </div>
    </div>
  );
}
function DepositModal({ fundLocations, preselect, onClose, onSubmit }) {
  const [locationId, setLocationId] = useState(preselect || fundLocations[0]?.id || ""); const [amount, setAmount] = useState(""); const [date, setDate] = useState(todayISO()); const [notes, setNotes] = useState("");
  const submit = () => { if (!locationId || !amount || Number(amount) <= 0) return; onSubmit({ locationId, amount: Number(amount), date, notes: notes.trim() }); };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(22,35,63,0.45)" }}>
      <div className="w-full max-w-sm bg-white rounded-sm p-4" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Add Funds</h2><button onClick={onClose}><X size={18} color={SLATE} /></button></div>
        <div className="space-y-2.5">
          <Field label="Account"><select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{fundLocations.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.type})</option>)}</select></Field>
          <Field label="Amount"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE, fontFamily: "ui-monospace, monospace" }} /></Field>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          <Field label="Source / notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Client payment" className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          <button onClick={submit} className="w-full py-2 rounded-sm text-sm font-semibold" style={{ background: INK, color: PAPER }}>Add Funds</button>
        </div>
      </div>
    </div>
  );
}
function TransferModal({ fundLocations, balances, onClose, onSubmit }) {
  const [fromId, setFromId] = useState(fundLocations[0]?.id || ""); const [toId, setToId] = useState(fundLocations[1]?.id || fundLocations[0]?.id || "");
  const [amount, setAmount] = useState(""); const [date, setDate] = useState(todayISO()); const [notes, setNotes] = useState(""); const [err, setErr] = useState("");
  const overBalance = amount && Number(amount) > (balances[fromId] || 0);
  const submit = () => {
    if (!fromId || !toId) { setErr("Choose both accounts"); return; }
    if (fromId === toId) { setErr("Pick two different accounts"); return; }
    if (!amount || Number(amount) <= 0) { setErr("Enter a valid amount"); return; }
    setErr(""); onSubmit({ fromId, toId, amount: Number(amount), date, notes });
  };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(22,35,63,0.45)" }}>
      <div className="w-full max-w-sm bg-white rounded-sm p-4" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Transfer Funds</h2><button onClick={onClose}><X size={18} color={SLATE} /></button></div>
        <div className="space-y-2.5">
          <Field label="From account"><select value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{fundLocations.map((f) => <option key={f.id} value={f.id}>{f.name} â€” {fmtMoney(balances[f.id] || 0)}</option>)}</select></Field>
          <div className="flex justify-center"><ArrowLeftRight size={14} color={BRASS} /></div>
          <Field label="To account"><select value={toId} onChange={(e) => setToId(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{fundLocations.map((f) => <option key={f.id} value={f.id}>{f.name} â€” {fmtMoney(balances[f.id] || 0)}</option>)}</select></Field>
          <Field label="Amount"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE, fontFamily: "ui-monospace, monospace" }} /></Field>
          {overBalance && <div className="text-[11px]" style={{ color: RUST }}>This exceeds the available balance in the source account.</div>}
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          <Field label="Notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          {err && <div className="text-[11px]" style={{ color: RUST }}>{err}</div>}
          <button onClick={submit} className="w-full py-2 rounded-sm text-sm font-semibold" style={{ background: INK, color: PAPER }}>Transfer</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- dashboard tab -------------------------------- */
function Dashboard({ stats, monthlyTrend, byDept, splitPie, fundLocations, balances, totalBalance }) {
  return (
    <div className="space-y-4">
      <div className="border rounded-sm p-3 bg-white flex items-center justify-between" style={{ borderColor: LINE, borderLeft: `3px solid ${INK}` }}>
        <div><div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: SLATE }}>Cash &amp; Bank Balance</div><div className="text-lg font-semibold" style={{ fontFamily: "ui-monospace, monospace", color: totalBalance < 0 ? RUST : INK }}>{fmtMoney(totalBalance)}</div></div>
        <div className="flex gap-1">{fundLocations.slice(0, 4).map((f) => <div key={f.id} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: PAPER, border: `1px solid ${LINE}` }} title={f.name}><FundIcon type={f.type} size={12} color={BRASS} /></div>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Kpi label="Total Recorded" value={fmtMoney(stats.total)} accent={INK} />
        <Kpi label="Salaries" value={fmtMoney(stats.salary)} accent={BRASS} />
        <Kpi label="Operational" value={fmtMoney(stats.op)} accent={FOREST} />
        <Kpi label="Pending / Overdue" value={fmtMoney(stats.pending)} accent={RUST} />
      </div>
      <Card title="Monthly Trend">
        {monthlyTrend.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid stroke={LINE} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} axisLine={{ stroke: LINE }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: SLATE }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} width={38} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: LINE }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Salary" stroke={INK} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Operational" stroke={BRASS} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
      <Card title="Salaries vs. Operational">
        {stats.total === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart><Pie data={splitPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>{splitPie.map((s, i) => <Cell key={i} fill={s.color} />)}</Pie><Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 2 }} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        )}
      </Card>
      <Card title="By Department">
        {byDept.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(160, byDept.length * 34)}>
            <BarChart data={byDept} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={LINE} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: SLATE }} tickFormatter={(v) => `$${v / 1000}k`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="department" width={110} tick={{ fontSize: 10, fill: INK }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 2 }} />
              <Bar dataKey="amount" fill={INK} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
      <div className="text-[11px] text-center pt-1" style={{ color: SLATE }}>{stats.count} entries in current filter</div>
    </div>
  );
}

/* ------------------------------- transactions tab ------------------------------ */
function Transactions({ filters, setFilters, showFilters, setShowFilters, activeFilterCount, resetFilters, filtered, canEdit, isAdmin, fundLocations, departments, nameFor, openAdd, openEdit, deleteEntry, setShowImport, exportCsv }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center border rounded-sm px-2 bg-white" style={{ borderColor: LINE }}>
          <Search size={14} color={SLATE} />
          <input className="w-full px-2 py-2 text-sm outline-none bg-transparent" placeholder="Search payee or notesâ€¦" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <button onClick={() => setShowFilters((v) => !v)} className="border rounded-sm px-3 flex items-center gap-1 text-xs bg-white" style={{ borderColor: LINE }}><Filter size={13} /> {activeFilterCount > 0 && <span style={{ color: BRASS }}>{activeFilterCount}</span>}</button>
      </div>
      {showFilters && <FilterPanel filters={filters} setFilters={setFilters} reset={resetFilters} fundLocations={fundLocations} departments={departments} />}
      <div className="flex gap-2 text-xs">
        {canEdit && <button onClick={() => setShowImport(true)} className="flex-1 border rounded-sm py-2 flex items-center justify-center gap-1 bg-white" style={{ borderColor: LINE }}><Upload size={13} /> Import CSV</button>}
        <button onClick={exportCsv} className="flex-1 border rounded-sm py-2 flex items-center justify-center gap-1 bg-white" style={{ borderColor: LINE }}><Download size={13} /> Export</button>
      </div>
      <div className="text-[11px]" style={{ color: SLATE }}>{filtered.length} matching entries</div>
      <div className="space-y-2">
        {filtered.length === 0 && <Empty />}
        {filtered.map((e) => {
          const fund = fundLocations.find((f) => f.id === e.fundLocationId);
          return (
            <div key={e.id} className="border rounded-sm p-3 bg-white" style={{ borderColor: LINE }}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0"><div className="text-sm font-medium truncate">{e.payee}</div><div className="text-[11px]" style={{ color: SLATE }}>{e.department} Â· {e.category}</div></div>
                <div className="text-right shrink-0"><div className="text-sm font-semibold" style={{ fontFamily: "ui-monospace, monospace" }}>{fmtMoney(e.amount)}</div><div className="text-[10px]" style={{ color: SLATE }}>{e.date}</div></div>
              </div>
              <div className="flex items-center justify-between mt-2 flex-wrap gap-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Stamp status={e.status} />
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm border" style={{ borderColor: LINE, color: e.type === "Salary" ? INK : BRASS }}>{e.type}</span>
                  {fund && <span className="text-[10px] px-1.5 py-0.5 rounded-sm border flex items-center gap-1" style={{ borderColor: LINE, color: SLATE }}><Wallet size={9} /> {fund.name}</span>}
                </div>
                {canEdit && <div className="flex gap-2"><button onClick={() => openEdit(e)} style={{ color: SLATE }}><Pencil size={14} /></button>{isAdmin && <button onClick={() => deleteEntry(e.id)} style={{ color: RUST }}><Trash2 size={14} /></button>}</div>}
              </div>
              <div className="text-[10px] mt-1.5 pt-1.5 border-t" style={{ color: SLATE, borderColor: LINE }}>Recorded by {nameFor(e.addedByUsername)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function FilterPanel({ filters, setFilters, reset, fundLocations, departments }) {
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const allCategories = filters.type === "Salary" ? SALARY_CATEGORIES : filters.type === "Operational" ? OP_CATEGORIES : [...SALARY_CATEGORIES, ...OP_CATEGORIES];
  return (
    <div className="border rounded-sm p-3 bg-white space-y-2.5" style={{ borderColor: LINE }}>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-[10px] uppercase tracking-wide" style={{ color: SLATE }}>From</label><input type="date" value={filters.from} onChange={set("from")} className="w-full border rounded-sm px-2 py-1.5 text-xs" style={{ borderColor: LINE }} /></div>
        <div><label className="text-[10px] uppercase tracking-wide" style={{ color: SLATE }}>To</label><input type="date" value={filters.to} onChange={set("to")} className="w-full border rounded-sm px-2 py-1.5 text-xs" style={{ borderColor: LINE }} /></div>
      </div>
      <Select label="Type" value={filters.type} onChange={set("type")} options={["All", "Salary", "Operational"]} />
      <Select label="Department" value={filters.department} onChange={set("department")} options={["All", ...departments]} />
      <Select label="Category" value={filters.category} onChange={set("category")} options={["All", ...allCategories]} />
      <Select label="Status" value={filters.status} onChange={set("status")} options={["All", ...STATUSES]} />
      {fundLocations.length > 0 && <div><label className="text-[10px] uppercase tracking-wide" style={{ color: SLATE }}>Funding Source</label><select value={filters.fund} onChange={set("fund")} className="w-full border rounded-sm px-2 py-1.5 text-xs bg-white" style={{ borderColor: LINE }}><option value="All">All</option>{fundLocations.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>}
      <button onClick={reset} className="text-xs w-full py-1.5 border rounded-sm flex items-center justify-center gap-1" style={{ borderColor: LINE, color: SLATE }}><X size={12} /> Clear filters</button>
    </div>
  );
}

/* --------------------------------- reports tab --------------------------------- */
const REPORT_DEFS = [
  { key: "monthly", label: "Monthly Summary" }, { key: "department", label: "By Department" }, { key: "category", label: "By Category" },
  { key: "salary", label: "Salary Register" }, { key: "vendor", label: "Vendor / Operational Register" }, { key: "pending", label: "Pending & Overdue" },
  { key: "funds", label: "Fund Balances" }, { key: "fundActivity", label: "Fund Activity (Deposits & Transfers)" }, { key: "activity", label: "Entry Activity Log" },
];
function Reports({ reportType, setReportType, rows, filters, setFilters, onExport }) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {REPORT_DEFS.map((r) => <button key={r.key} onClick={() => setReportType(r.key)} className="shrink-0 text-xs px-3 py-1.5 rounded-sm border" style={{ borderColor: reportType === r.key ? INK : LINE, background: reportType === r.key ? INK : "white", color: reportType === r.key ? PAPER : INK }}>{r.label}</button>)}
      </div>
      {reportType !== "funds" && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] uppercase tracking-wide" style={{ color: SLATE }}>From</label><input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="w-full border rounded-sm px-2 py-1.5 text-xs bg-white" style={{ borderColor: LINE }} /></div>
          <div><label className="text-[10px] uppercase tracking-wide" style={{ color: SLATE }}>To</label><input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="w-full border rounded-sm px-2 py-1.5 text-xs bg-white" style={{ borderColor: LINE }} /></div>
        </div>
      )}
      <button onClick={onExport} className="w-full border rounded-sm py-2 text-xs flex items-center justify-center gap-1.5 bg-white" style={{ borderColor: LINE }}><Download size={13} /> Export this report as CSV</button>
      <div className="border rounded-sm bg-white overflow-x-auto" style={{ borderColor: LINE }}>
        {rows.length === 0 ? <Empty /> : (
          <table className="w-full text-[11px]" style={{ fontFamily: "ui-monospace, monospace" }}>
            <thead><tr style={{ background: PAPER }}>{cols.map((c) => <th key={c} className="text-left px-2 py-2 whitespace-nowrap font-semibold" style={{ color: INK, borderBottom: `1px solid ${LINE}` }}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>{cols.map((c) => <td key={c} className="px-2 py-1.5 whitespace-nowrap">{typeof row[c] === "number" ? (c.toLowerCase().includes("%") ? `${row[c]}%` : fmtMoney(row[c])) : row[c]}</td>)}</tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- entry form ---------------------------------- */
function EntryForm({ form, setForm, onCancel, onSubmit, fundLocations, balances, departments }) {
  const set = (k) => (e) => { const v = e.target.value; setForm((f) => { const next = { ...f, [k]: v }; if (k === "type") next.category = v === "Salary" ? SALARY_CATEGORIES[0] : OP_CATEGORIES[0]; return next; }); };
  const categories = form.type === "Salary" ? SALARY_CATEGORIES : OP_CATEGORIES;
  const selectedBalance = form.fundLocationId ? (balances[form.fundLocationId] || 0) : null;
  const overBalance = selectedBalance !== null && Number(form.amount) > selectedBalance;
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" style={{ background: "rgba(22,35,63,0.45)" }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-lg sm:rounded-sm max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white" style={{ borderColor: LINE }}>
          <h2 className="text-base font-semibold" style={{ fontFamily: "ui-serif, Georgia, serif" }}>{form.id ? "Edit Entry" : "Record Expense"}</h2>
          <button onClick={onCancel}><X size={18} color={SLATE} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">{["Salary", "Operational"].map((t) => <button key={t} onClick={() => set("type")({ target: { value: t } })} className="flex-1 py-2 text-xs rounded-sm border font-medium" style={{ borderColor: form.type === t ? INK : LINE, background: form.type === t ? INK : "white", color: form.type === t ? PAPER : INK }}>{t}</button>)}</div>
          <Field label={form.type === "Salary" ? "Employee Name" : "Vendor / Payee"}><input value={form.payee} onChange={set("payee")} placeholder={form.type === "Salary" ? "e.g. Sara Haddad" : "e.g. AC Parts Supply Co."} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount (USD)"><input type="number" min="0" value={form.amount} onChange={set("amount")} placeholder="0" className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE, fontFamily: "ui-monospace, monospace" }} /></Field>
            <Field label="Date"><input type="date" value={form.date} onChange={set("date")} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
          </div>
          <Field label="Funding source">
            {fundLocations.length === 0 ? <div className="text-xs px-3 py-2 border rounded-sm" style={{ borderColor: LINE, color: RUST }}>No accounts set up yet â€” add one under Funds first.</div> : (
              <>
                <select value={form.fundLocationId} onChange={set("fundLocationId")} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{fundLocations.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.type}) â€” {fmtMoney(balances[f.id] || 0)}</option>)}</select>
                {overBalance && <div className="text-[11px] mt-1" style={{ color: RUST }}>This exceeds the available balance in this account.</div>}
              </>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Department"><select value={form.department} onChange={set("department")} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{departments.map((d) => <option key={d}>{d}</option>)}</select></Field>
            <Field label="Category"><select value={form.category} onChange={set("category")} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Payment Method"><select value={form.paymentMethod} onChange={set("paymentMethod")} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Status"><select value={form.status} onChange={set("status")} className="w-full border rounded-sm px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <Field label="Notes (optional)"><textarea value={form.notes} onChange={set("notes")} rows={2} className="w-full border rounded-sm px-3 py-2 text-sm" style={{ borderColor: LINE }} /></Field>
        </div>
        <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-white" style={{ borderColor: LINE }}>
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-sm border text-sm" style={{ borderColor: LINE, color: SLATE }}>Cancel</button>
          <button onClick={onSubmit} className="flex-1 py-2.5 rounded-sm text-sm font-semibold" style={{ background: INK, color: PAPER }}>{form.id ? "Save Changes" : "Record Entry"}</button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- import modal --------------------------------- */
function ImportModal({ onClose, onFile }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(22,35,63,0.45)" }}>
      <div className="w-full max-w-sm bg-white rounded-sm p-4" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Import CSV</h2><button onClick={onClose}><X size={18} color={SLATE} /></button></div>
        <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }} className="border-2 border-dashed rounded-sm p-6 text-center text-xs cursor-pointer" style={{ borderColor: dragging ? BRASS : LINE, color: SLATE }} onClick={() => document.getElementById("csv-input").click()}>
          <Upload size={20} className="mx-auto mb-2" color={SLATE} />
          Drop a CSV file here or tap to browse
          <input id="csv-input" type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        </div>
        <p className="text-[10px] mt-3 leading-relaxed" style={{ color: SLATE }}>Expected columns (any order): Date, Type (Salary/Operational), Department, Payee, Category, Amount, Currency, Payment Method, Status, Funding Source, Notes.</p>
      </div>
    </div>
  );
}

