"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import "./pitstop.css";

type Lead = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_interest: string;
  status: "new" | "contacted" | "closed" | "lost" | string;
  notes: string;
  created_at: string;
  source?: string;
  assigned_to?: string;
  followup_date?: string;
  source_url?: string;
  tenant_id?: string;
};

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year?: number | null;
  price?: number | null;
  price_on_request?: boolean | null;
  type?: string | null;
  category?: string | null;
  status?: string | null;
  color?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  odometer?: number | null;
  owners?: number | null;
  location?: string | null;
  currency?: string | null;
  tenant_id?: string | null;
  created_at?: string | null;
};

const LOCALES: { id: string; label: string }[] = [
  { id: "en-US", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "en-IN", label: "English (India)" },
  { id: "de-DE", label: "Deutsch (DE)" },
  { id: "fr-FR", label: "Français (FR)" },
  { id: "ar-AE", label: "العربية (AE)" },
  { id: "en-SG", label: "English (SG)" },
];

const CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
];

const VEHICLE_STATUSES: Record<string, { label: string; cls: string; dot: string }> = {
  available:   { label: "Available",   cls: "vs-available",  dot: "#22c55e" },
  reserved:    { label: "Reserved",    cls: "vs-reserved",   dot: "#f59e0b" },
  sold:        { label: "Sold",        cls: "vs-sold",       dot: "#64748b" },
  incoming:    { label: "Incoming",    cls: "vs-transit",    dot: "#3b82f6" },
  service:     { label: "Service",     cls: "vs-inspection", dot: "#8b5cf6" },
  demo:        { label: "Demo",        cls: "vs-demo",       dot: "#ec4899" },
  unavailable: { label: "Unavailable", cls: "vs-unavail",    dot: "#ef4444" },
};

const VEHICLE_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "all",       label: "All",       emoji: "🚗" },
  { id: "sedan",     label: "Sedan",     emoji: "🚙" },
  { id: "suv",       label: "SUV",       emoji: "🛻" },
  { id: "hatchback", label: "Hatchback", emoji: "🚘" },
  { id: "muv",       label: "MUV/MPV",   emoji: "🚐" },
  { id: "luxury",    label: "Luxury",    emoji: "🏎️" },
  { id: "electric",  label: "EV",        emoji: "⚡" },
  { id: "truck",     label: "Truck",     emoji: "🚚" },
];


function safeLower(s?: string | null) {
  return (s || "").toLowerCase();
}

function daysAgo(iso?: string | null) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function minutesAgo(iso?: string) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function formatRelativeTime(iso?: string, locale = "en-US") {
  if (!iso) return "";
  const mins = minutesAgo(iso);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const d = Math.floor(hrs / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

function formatMoney(
  amount?: number | null,
  currency = "USD",
  locale = "en-US",
  onRequest?: boolean | null
) {
  if (onRequest) return "Price on request";
  if (amount === null || amount === undefined || amount === 0) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount}`;
  }
}

function kmToMi(km: number) { return km * 0.621371; }
function formatDistance(valueKm?: number | null, unit: "km" | "mi" = "km") {
  if (!valueKm) return "";
  const v = unit === "km" ? valueKm : kmToMi(valueKm);
  return `${Math.round(v).toLocaleString()} ${unit === "km" ? "km" : "mi"}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [userEmail, setUserEmail]         = useState("");
  const [view, setView]                   = useState<"analytics" | "inventory">("inventory");
  const [leads, setLeads]                 = useState<Lead[]>([]);
  const [vehicles, setVehicles]           = useState<Vehicle[]>([]);
  const [loading, setLoading]             = useState(true);
  const [locale, setLocale]               = useState<string>("en-GB");
  const [currency, setCurrency]           = useState<string>("USD");
  const [distanceUnit, setDistanceUnit]   = useState<"km" | "mi">("km");
  const [tenantId, setTenantId]           = useState<string | null>(null);
  const [tenantWarning, setTenantWarning] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { router.push("/login"); return; }
      setUserEmail(data.user.email ?? "");
      await loadAll();
    })();

    const vc = supabase
      .channel("rt-vehicles-globalfit")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, (p) => {
        if (p.eventType === "INSERT")
          setVehicles((prev) => [p.new as Vehicle, ...prev]);
        else if (p.eventType === "UPDATE")
          setVehicles((prev) => prev.map((v) => v.id === (p.new as any).id ? { ...v, ...(p.new as Vehicle) } : v));
        else if (p.eventType === "DELETE")
          setVehicles((prev) => prev.filter((v) => v.id !== (p.old as any).id));
      })
      .subscribe();

    return () => { supabase.removeChannel(vc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    const t = await tryGetTenantId();
    setTenantId(t);
    await Promise.all([fetchLeadsSafe(), fetchVehiclesSafe()]);
    setLoading(false);
  }

  async function tryGetTenantId(): Promise<string | null> {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return null;
      const { data, error } = await supabase
        .from("memberships").select("tenant_id").eq("user_id", auth.user.id).maybeSingle();
      if (error) { setTenantWarning("Tenant membership not detected yet. Inventory writes may fail until memberships (tenant_id, user_id, role) is set up."); return null; }
      if (!data?.tenant_id) { setTenantWarning("No tenant_id found for this user. Add a row in memberships to enable multi-dealer inventory writes."); return null; }
      setTenantWarning("");
      return data.tenant_id as string;
    } catch {
      setTenantWarning("Tenant membership not detected yet. Inventory writes may fail until memberships is set up.");
      return null;
    }
  }

  async function fetchLeadsSafe() {
    try {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      if (!error && data) setLeads(data as Lead[]);
    } catch {}
  }

  async function fetchVehiclesSafe() {
    try {
      const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
      if (!error && data) setVehicles(data as Vehicle[]);
    } catch {}
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="ps-root">
      <aside className="ps-sidebar">
        <div className="ps-brand">
          <div className="ps-brand-mark" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="ps-brand-name">PitStop</div>
            <div className="ps-brand-sub">Dealer Operations</div>
          </div>
        </div>

        <nav className="ps-nav">
          <span className="ps-nav-label">Workspace</span>
          <button className={`ps-nav-btn ${view === "analytics" ? "active" : ""}`} onClick={() => setView("analytics")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Analytics
          </button>
          <button className={`ps-nav-btn ${view === "inventory" ? "active" : ""}`} onClick={() => setView("inventory")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            Inventory
          </button>

          <span className="ps-nav-label" style={{ marginTop: 10 }}>Global settings</span>
          <div className="ps-nav-settings">
            <select className="ps-filter-sel" value={locale} onChange={(e) => setLocale(e.target.value)}>
              {LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <select className="ps-filter-sel" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <select className="ps-filter-sel" value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value as "km" | "mi")}>
              <option value="km">Distance: km</option>
              <option value="mi">Distance: miles</option>
            </select>
          </div>

          <span className="ps-nav-label" style={{ marginTop: 10 }}>Integrations</span>
          <div className="ps-nav-integration">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877f2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
            <span className="ps-live-chip">LIVE</span>
          </div>
        </nav>

        <div className="ps-sidebar-foot">
          <div className="ps-user-row">
            <div className="ps-ava">{userEmail ? userEmail[0].toUpperCase() : "D"}</div>
            <div className="ps-user-meta">
              <div className="ps-user-email">{userEmail}</div>
              <div className="ps-user-role">Dealer Admin</div>
            </div>
            <button className="ps-logout" onClick={logout} title="Sign out">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="ps-main">
        <div className="ps-content">
          {tenantWarning && (
            <div className="ps-risk-bar ps-risk-bar--warn" style={{ marginBottom: 14 }}>
              <span className="ps-risk-bar-icon">🧩</span>
              <div className="ps-risk-bar-headline">{tenantWarning}</div>
            </div>
          )}
          {loading ? (
            <div className="ps-blank">
              <div className="ps-blank-title">Loading…</div>
              <div className="ps-blank-sub">Fetching live data</div>
            </div>
          ) : view === "analytics" ? (
            <AnalyticsView leads={leads} vehicles={vehicles} locale={locale} currency={currency} distanceUnit={distanceUnit}/>
          ) : (
            <InventoryView leads={leads} vehicles={vehicles} setVehicles={setVehicles} locale={locale} currency={currency} distanceUnit={distanceUnit} tenantId={tenantId} onRefresh={fetchVehiclesSafe}/>
          )}
        </div>
      </main>
    </div>
  );
}

function AnalyticsView({ leads, vehicles, locale, currency, distanceUnit }: {
  leads: Lead[]; vehicles: Vehicle[]; locale: string; currency: string; distanceUnit: "km" | "mi";
}) {
  const total        = leads.length;
  const inbox        = leads.filter((l) => l.status === "new").length;
  const contacted    = leads.filter((l) => l.status === "contacted").length;
  const won          = leads.filter((l) => l.status === "closed").length;
  const lost         = leads.filter((l) => l.status === "lost").length;
  const conversion   = total ? Math.round((won / total) * 100) : 0;
  const contactRate  = total ? Math.round(((contacted + won) / total) * 100) : 0;
  const lossRate     = total ? Math.round((lost / total) * 100) : 0;
  const followupsDue = leads.filter((l) => l.followup_date && new Date(l.followup_date) <= new Date() && l.status !== "closed" && l.status !== "lost").length;
  const backlogRisk  = leads.filter((l) => l.status === "new" && minutesAgo(l.created_at) >= 60).length;

  const topModels = useMemo(() => {
    const map = new Map<string, number>();
    vehicles.forEach((v) => { const key = `${v.make} ${v.model}`.trim(); if (key) map.set(key, (map.get(key) || 0) + 1); });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [vehicles]);

  const insight = useMemo(() => {
    if (backlogRisk > 0) return { icon: "⚠️", title: "Response risk detected", sub: `${backlogRisk} uncontacted lead(s) are older than 60 minutes.` };
    if (inbox > 0)       return { icon: "⚡", title: "New leads waiting",       sub: `${inbox} lead(s) are uncontacted. Fast response improves conversion.` };
    if (total === 0)     return { icon: "🚀", title: "No data yet",             sub: "Once leads arrive, you'll see conversion, contact rate and pipeline insights." };
    return                      { icon: "✅", title: "Pipeline looks healthy",  sub: "Great momentum — keep follow-ups consistent." };
  }, [backlogRisk, inbox, total]);

  return (
    <div className="ps-analytics">
      <div className="ps-insight">
        <span className="ps-insight-icon">{insight.icon}</span>
        <div>
          <div className="ps-insight-text">{insight.title}</div>
          <div className="ps-insight-sub">{insight.sub}</div>
        </div>
      </div>

      <div className="ps-metrics-row">
        {[
          { label: "Conversion",     val: `${conversion}%`,  sub: "leads → closed deals",  bar: conversion,  col: "#22c55e" },
          { label: "Contact rate",   val: `${contactRate}%`, sub: "contacted or closed",   bar: contactRate, col: "#3b82f6" },
          { label: "Loss rate",      val: `${lossRate}%`,    sub: "marked as lost",        bar: lossRate,    col: "#ef4444" },
          { label: "Follow-ups due", val: `${followupsDue}`, sub: "need action today",     bar: Math.min(followupsDue * 20, 100), col: "#f59e0b" },
        ].map((m) => (
          <div key={m.label} className="ps-metric-box">
            <div className="ps-metric-val">{m.val}</div>
            <div className="ps-metric-lbl">{m.label}</div>
            <div className="ps-metric-sub">{m.sub}</div>
            <div className="ps-metric-track"><div className="ps-metric-fill" style={{ width: `${m.bar}%`, background: m.col }}/></div>
          </div>
        ))}
      </div>

      <div className="ps-charts-row">
        <div className="ps-chart-box">
          <div className="ps-chart-title">Pipeline funnel</div>
          {[
            { label: "Leads received", count: total,           pct: 100,        col: "#6366f1" },
            { label: "Contacted",      count: contacted + won, pct: total ? Math.round(((contacted + won) / total) * 100) : 0, col: "#3b82f6" },
            { label: "Closed",         count: won,             pct: conversion,  col: "#22c55e" },
          ].map((s) => (
            <div key={s.label} className="ps-funnel-item">
              <div className="ps-funnel-track"><div className="ps-funnel-bar" style={{ width: `${Math.max(s.pct, 3)}%`, background: s.col }}/></div>
              <div className="ps-funnel-meta"><span style={{ color: s.col }}>{s.label}</span><span className="ps-funnel-n">{s.count}</span></div>
              <div className="ps-funnel-pct" style={{ color: s.col }}>{s.pct}%</div>
            </div>
          ))}
          <div className="ps-src-note" style={{ marginTop: 14 }}>Tip: For global teams, set locale/currency in the sidebar so your dashboards match the region.</div>
        </div>

        <div className="ps-chart-box">
          <div className="ps-chart-title">Inventory snapshot</div>
          <div className="ps-src-row">
            <div className="ps-src-meta"><span className="ps-src-dot" style={{ background: "#22c55e" }}/>Available</div>
            <div className="ps-src-track"><div className="ps-src-fill" style={{ width: `${vehicles.length ? Math.round((vehicles.filter((v) => v.status === "available").length / vehicles.length) * 100) : 0}%`, background: "#22c55e" }}/></div>
            <div className="ps-src-pct">{vehicles.length ? Math.round((vehicles.filter((v) => v.status === "available").length / vehicles.length) * 100) : 0}%</div>
          </div>
          <div className="ps-chart-title" style={{ marginTop: 18 }}>Top models</div>
          {topModels.length === 0 ? (
            <p className="ps-chart-empty">Add vehicles to see top models</p>
          ) : topModels.map(([name, count]) => (
            <div key={name} className="ps-lb-row">
              <span className="ps-lb-rank">•</span>
              <div className="ps-lb-info"><div className="ps-lb-name">{name}</div><div className="ps-lb-sub">{count} in inventory</div></div>
              <div className="ps-lb-rate">{count}</div>
            </div>
          ))}
          <div className="ps-src-note" style={{ marginTop: 14 }}>Units: {distanceUnit.toUpperCase()} · Locale: {locale} · Currency: {currency}</div>
        </div>
      </div>
    </div>
  );
}

function InventoryView({ leads, vehicles, setVehicles, locale, currency, distanceUnit, tenantId, onRefresh }: {
  leads: Lead[]; vehicles: Vehicle[]; setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  locale: string; currency: string; distanceUnit: "km" | "mi"; tenantId: string | null; onRefresh: () => Promise<void>;
}) {
  const [mode, setMode]       = useState<"grid" | "add" | "bulk">("grid");
  const [catF, setCatF]       = useState<string>("all");
  const [stF, setStF]         = useState<string>("all");
  const [q, setQ]             = useState<string>("");
  const [editId, setEditId]   = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saveOk, setSaveOk]   = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [bulkRes, setBulkRes] = useState<{ ok: number; errs: string[] } | null>(null);

  const blank = { make:"", model:"", year:"", price:"", price_on_request:false, type:"used", category:"sedan", status:"available", color:"", fuel:"petrol", transmission:"manual", odometer:"", owners:"1", location:"", currency };
  const [form, setForm] = useState(blank);
  useEffect(() => { setForm((p) => ({ ...p, currency })); }, [currency]); // eslint-disable-line

  function getIntel(v: Vehicle) {
    const needle      = `${v.make} ${v.model}`.toLowerCase().trim();
    const related     = leads.filter((l) => safeLower(l.vehicle_interest).includes(needle));
    const active      = related.filter((l) => l.status !== "closed" && l.status !== "lost");
    const uncontacted = related.filter((l) => l.status === "new");
    const oldest      = [...active].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
    return { total: related.length, active: active.length, uncontacted: uncontacted.length, waitHrs: oldest ? Math.floor(minutesAgo(oldest.created_at) / 60) : 0, firstNew: uncontacted[0] };
  }

  const filtered = useMemo(() => vehicles
    .filter((v) => catF === "all" || v.category === catF)
    .filter((v) => stF === "all" || v.status === stF)
    .filter((v) => !q || `${v.make} ${v.model} ${v.color||""} ${v.location||""}`.toLowerCase().includes(q.toLowerCase())),
  [vehicles, catF, stF, q]);

  const stats = useMemo(() => ({
    total:     vehicles.length,
    avail:     vehicles.filter((v) => v.status === "available").length,
    res:       vehicles.filter((v) => v.status === "reserved").length,
    sold:      vehicles.filter((v) => v.status === "sold").length,
    withLeads: vehicles.filter((v) => getIntel(v).total > 0).length,
  }), [vehicles, leads]); // eslint-disable-line

  async function updateVehicleStatus(id: string, status: string) {
    await supabase.from("vehicles").update({ status }).eq("id", id);
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v)));
  }
  async function deleteVehicle(id: string) {
    if (!confirm("Remove this vehicle from inventory?")) return;
    await supabase.from("vehicles").delete().eq("id", id);
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  }
  function startEdit(v: Vehicle) {
    setForm({ make:v.make||"", model:v.model||"", year:v.year?String(v.year):"", price:v.price?String(v.price):"", price_on_request:!!v.price_on_request, type:(v.type as any)||"used", category:(v.category as any)||"sedan", status:(v.status as any)||"available", color:v.color||"", fuel:(v.fuel as any)||"petrol", transmission:(v.transmission as any)||"manual", odometer:v.odometer?String(v.odometer):"", owners:v.owners?String(v.owners):"1", location:v.location||"", currency:v.currency||currency });
    setEditId(v.id); setMode("add"); setSaveErr(""); setSaveOk(false);
  }
  async function saveVehicle() {
    if (!form.make.trim() || !form.model.trim()) { setSaveErr("Make and Model are required."); return; }
    setSaving(true); setSaveErr(""); setSaveOk(false);
    try {
      const payload: any = { make:form.make.trim(), model:form.model.trim(), year:form.year?parseInt(form.year,10):null, price:form.price_on_request?null:form.price?parseFloat(form.price):null, price_on_request:form.price_on_request, type:form.type, category:form.category, status:form.status, color:form.color||null, fuel:form.fuel||null, transmission:form.transmission||null, odometer:form.odometer?parseInt(form.odometer,10):null, owners:form.owners?parseInt(form.owners,10):1, location:form.location||null, currency:form.currency||currency };
      if (tenantId) payload.tenant_id = tenantId;
      if (editId) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", editId);
        if (error) throw error;
        setVehicles((prev) => prev.map((v) => (v.id === editId ? { ...v, ...payload } : v)));
      } else {
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) throw error;
        await onRefresh();
      }
      setSaveOk(true); setEditId(null); setForm(blank);
      setTimeout(() => { setSaveOk(false); setMode("grid"); }, 1200);
    } catch (e: any) { setSaveErr(e?.message || "Save failed."); }
    setSaving(false);
  }
  function downloadTemplate() {
    const csv = "make,model,year,price,type,category,status,color,fuel,transmission,odometer,owners,location,currency\nHonda,City,2020,750000,used,sedan,available,White,petrol,manual,45000,1,Mumbai,INR\nFord,F-150,2022,52000,new,truck,incoming,Black,petrol,automatic,0,0,Austin,USD\nTesla,Model 3,2023,45000,new,electric,available,Red,electric,automatic,0,0,London,GBP\n";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" })); a.download = "pitstop-inventory-template.csv"; a.click();
  }
  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setSaving(true); setBulkRes(null);
    try {
      const lines = (await file.text()).trim().split("\n");
      if (lines.length < 2) throw new Error("CSV must contain header + at least 1 row.");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      let ok = 0; const errs: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim(); if (!line) continue;
        const row: Record<string,string> = {}; lines[i].split(",").map((v) => v.trim()).forEach((v, idx) => (row[headers[idx]] = v));
        if (!row.make || !row.model) { errs.push(`Row ${i+1}: missing make/model`); continue; }
        const payload: any = { make:row.make, model:row.model, year:row.year?parseInt(row.year,10):null, price:row.price?parseFloat(row.price):null, type:row.type||"used", category:row.category||"sedan", status:row.status||"available", color:row.color||null, fuel:row.fuel||null, transmission:row.transmission||null, odometer:row.odometer?parseInt(row.odometer,10):null, owners:row.owners?parseInt(row.owners,10):1, location:row.location||null, currency:row.currency||currency };
        if (tenantId) payload.tenant_id = tenantId;
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) errs.push(`Row ${i+1}: ${error.message}`); else ok++;
      }
      setBulkRes({ ok, errs }); await onRefresh();
    } catch (err: any) { setBulkRes({ ok:0, errs:[err?.message||"Bulk upload failed."] }); }
    setSaving(false); e.target.value = "";
  }

  return (
    <div className="ps-inv">
      <div className="ps-inv-stats">
        {[{l:"Total",v:stats.total,cls:""},{l:"Available",v:stats.avail,cls:"g"},{l:"Reserved",v:stats.res,cls:"a"},{l:"Sold",v:stats.sold,cls:"m"},{l:"With leads",v:stats.withLeads,cls:"o"}].map((s) => (
          <div key={s.l} className={`ps-inv-stat ${s.cls}`}><div className="ps-inv-sv">{s.v}</div><div className="ps-inv-sl">{s.l}</div></div>
        ))}
      </div>

      <div className="ps-inv-ctrl">
        <div className="ps-inv-ctrl-top">
          <div className="ps-search-box">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input className="ps-search-inp" placeholder="Search inventory…" value={q} onChange={(e) => setQ(e.target.value)}/>
            {q && <button className="ps-search-x" onClick={() => setQ("")}>×</button>}
          </div>
          <select className="ps-filter-sel" value={stF} onChange={(e) => setStF(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(VEHICLE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="ps-filter-sel" value={currency} disabled><option value={currency}>{currency}</option></select>
          <div className="ps-inv-btns">
            <button className={`ps-inv-btn ${mode==="grid"?"active":""}`} onClick={() => setMode("grid")}>View all</button>
            <button className="ps-inv-btn primary" onClick={() => { setMode("add"); setEditId(null); setForm(blank); setSaveErr(""); setSaveOk(false); }}>+ Add vehicle</button>
            <button className={`ps-inv-btn ${mode==="bulk"?"active":""}`} onClick={() => setMode("bulk")}>Bulk upload</button>
          </div>
        </div>
        <div className="ps-cat-row">
          {VEHICLE_CATEGORIES.map((c) => (
            <button key={c.id} className={`ps-cat-btn ${catF===c.id?"active":""}`} onClick={() => setCatF(c.id)}>
              {c.emoji} {c.label}
              {c.id !== "all" && <span className="ps-cat-n">{vehicles.filter((v) => v.category === c.id).length}</span>}
            </button>
          ))}
        </div>
      </div>

      {mode === "add" && (
        <div className="ps-form-card">
          <div className="ps-form-title">{editId ? "Edit vehicle" : "Add new vehicle"}</div>
          {!tenantId && <div className="ps-form-err">Tenant not set. If your vehicles table requires <b>tenant_id</b>, saving may fail until memberships is configured.</div>}
          {saveErr && <div className="ps-form-err">{saveErr}</div>}
          {saveOk  && <div className="ps-form-ok">Saved successfully</div>}
          <div className="ps-form-sect">Basic</div>
          <div className="ps-form-grid">
            <div className="ps-ff"><label>Make *</label><input className="ps-inp" value={form.make} onChange={(e) => setForm({...form,make:e.target.value})}/></div>
            <div className="ps-ff"><label>Model *</label><input className="ps-inp" value={form.model} onChange={(e) => setForm({...form,model:e.target.value})}/></div>
            <div className="ps-ff"><label>Year</label><input className="ps-inp" value={form.year} onChange={(e) => setForm({...form,year:e.target.value})}/></div>
            <div className="ps-ff">
              <label>Price {form.price_on_request && <span className="ps-badge-sm">On request</span>}</label>
              <input className="ps-inp" value={form.price} disabled={form.price_on_request} onChange={(e) => setForm({...form,price:e.target.value})}/>
              <label className="ps-chk"><input type="checkbox" checked={form.price_on_request} onChange={(e) => setForm({...form,price_on_request:e.target.checked,price:""})}/>Price on request</label>
            </div>
          </div>
          <div className="ps-form-sect">Details</div>
          <div className="ps-form-grid">
            <div className="ps-ff"><label>Category</label><select className="ps-inp" value={form.category} onChange={(e) => setForm({...form,category:e.target.value})}>{VEHICLE_CATEGORIES.filter(c=>c.id!=="all").map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</select></div>
            <div className="ps-ff"><label>Condition</label><select className="ps-inp" value={form.type} onChange={(e) => setForm({...form,type:e.target.value})}><option value="used">Used</option><option value="new">New</option></select></div>
            <div className="ps-ff"><label>Fuel</label><select className="ps-inp" value={form.fuel} onChange={(e) => setForm({...form,fuel:e.target.value})}><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option><option value="cng">CNG</option></select></div>
            <div className="ps-ff"><label>Transmission</label><select className="ps-inp" value={form.transmission} onChange={(e) => setForm({...form,transmission:e.target.value})}><option value="manual">Manual</option><option value="automatic">Automatic</option><option value="amt">AMT</option><option value="cvt">CVT</option></select></div>
            <div className="ps-ff"><label>Color</label><input className="ps-inp" value={form.color} onChange={(e) => setForm({...form,color:e.target.value})}/></div>
            <div className="ps-ff"><label>Odometer ({distanceUnit})</label><input className="ps-inp" value={form.odometer} onChange={(e) => setForm({...form,odometer:e.target.value})}/></div>
            <div className="ps-ff"><label>Owners</label><input className="ps-inp" value={form.owners} onChange={(e) => setForm({...form,owners:e.target.value})}/></div>
            <div className="ps-ff"><label>Location / Branch</label><input className="ps-inp" value={form.location} onChange={(e) => setForm({...form,location:e.target.value})}/></div>
          </div>
          <div className="ps-form-sect">Status</div>
          <div className="ps-form-grid">
            <div className="ps-ff"><label>Status</label><select className="ps-inp" value={form.status} onChange={(e) => setForm({...form,status:e.target.value})}>{Object.entries(VEHICLE_STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            <div className="ps-ff"><label>Currency</label><input className="ps-inp" value={form.currency} disabled/></div>
          </div>
          <div className="ps-form-acts">
            <button className="ps-form-save" onClick={saveVehicle} disabled={saving}>{saving?"Saving…":saveOk?"Saved ✓":editId?"Save changes":"Add to inventory"}</button>
            <button className="ps-form-cancel" onClick={() => { setMode("grid"); setEditId(null); setForm(blank); setSaveErr(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {mode === "bulk" && (
        <div className="ps-form-card">
          <div className="ps-form-title">Bulk upload (CSV)</div>
          {!tenantId && <div className="ps-form-err">Tenant not set. If your vehicles table requires <b>tenant_id</b>, bulk upload may fail until memberships is configured.</div>}
          <div className="ps-bulk">
            <div className="ps-bulk-step"><div className="ps-bsn">1</div><div><div className="ps-bsh">Download template</div><div className="ps-bsb">Fill in your inventory in Excel/Sheets, then upload</div><button className="ps-bsdl" onClick={downloadTemplate}>Download template →</button></div></div>
            <div className="ps-bulk-step"><div className="ps-bsn">2</div><div><div className="ps-bsh">Upload CSV</div><div className="ps-bsb">Columns: make, model, year, price, type, category, status, color, fuel, transmission, odometer, owners, location, currency</div><label className="ps-bsup">{saving?"Uploading…":"Choose CSV file"}<input type="file" accept=".csv" onChange={handleBulkUpload} style={{display:"none"}} disabled={saving}/></label></div></div>
          </div>
          {bulkRes && (
            <div className={`ps-bulk-res ${bulkRes.errs.length?"err":"ok"}`}>
              {bulkRes.ok > 0 && <div>{bulkRes.ok} vehicle(s) added</div>}
              {bulkRes.errs.map((e, i) => <div key={i} className="ps-bulk-err">⚠ {e}</div>)}
            </div>
          )}
        </div>
      )}

      {mode === "grid" && (filtered.length === 0 ? (
        <div className="ps-blank"><div className="ps-blank-icon">🚗</div><div className="ps-blank-title">No vehicles found</div><div className="ps-blank-sub">Try adjusting filters or add a vehicle</div></div>
      ) : (
        <div className="ps-vgrid">
          {filtered.map((v) => {
            const intel   = getIntel(v);
            const st      = VEHICLE_STATUSES[v.status || "available"] || VEHICLE_STATUSES.available;
            const recency = formatRelativeTime(v.created_at || undefined, locale);
            return (
              <div key={v.id} className={`ps-vcard ${intel.uncontacted > 0 ? "ps-vcard--alert" : ""}`}>
                <div className="ps-vcard-photo">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(100,116,139,0.3)" strokeWidth="1.2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  <div className="ps-vcard-badges">
                    {intel.total > 0 && <span className="ps-vcard-lead-badge">{intel.total} lead{intel.total>1?"s":""}</span>}
                    <span className="ps-vcard-type">{String(v.type || "used").toUpperCase()}</span>
                  </div>
                  {v.location && <div className="ps-vcard-loc">📍 {v.location}</div>}
                </div>
                <div className="ps-vcard-body">
                  <div className="ps-vcard-name">{v.make} {v.model}</div>
                  <div className="ps-vcard-tags">
                    {v.year         && <span className="ps-vt">{v.year}</span>}
                    {v.fuel         && <span className="ps-vt">{v.fuel}</span>}
                    {v.transmission && <span className="ps-vt">{v.transmission}</span>}
                    {v.color        && <span className="ps-vt">{v.color}</span>}
                  </div>
                  {(v.odometer || v.owners) && (
                    <div className="ps-vcard-odo">
                      {formatDistance(v.odometer || 0, distanceUnit)}
                      {v.owners ? ` · ${v.owners} owner${v.owners>1?"s":""}` : ""}
                    </div>
                  )}
                  <div className="ps-vcard-price">{formatMoney(v.price, v.currency||currency, locale, v.price_on_request)}</div>
                  {intel.total > 0 && (
                    <div className="ps-vcard-intel">
                      <span>{intel.active} active</span>
                      {intel.uncontacted > 0 && <span className="ps-vci-warn">{intel.uncontacted} uncontacted</span>}
                      {intel.waitHrs > 0 && <span className={intel.waitHrs>2?"ps-vci-danger":""}>{intel.waitHrs}h waiting</span>}
                    </div>
                  )}
                  <div className="ps-vcard-status-row">
                    <span className={`ps-vcard-status ${st.cls}`}><span className="ps-vst-dot" style={{background:st.dot}}/>{st.label}</span>
                    <span className="ps-vcard-days">{recency}</span>
                  </div>
                  <div className="ps-vcard-actions">
                    {v.status==="available"  && <button className="ps-va" onClick={()=>updateVehicleStatus(v.id,"reserved")}>Reserve</button>}
                    {v.status==="reserved"   && <button className="ps-va" onClick={()=>updateVehicleStatus(v.id,"available")}>Unreserve</button>}
                    {v.status!=="sold"       && <button className="ps-va ps-va--sold" onClick={()=>updateVehicleStatus(v.id,"sold")}>Mark sold</button>}
                    {v.status==="sold"       && <button className="ps-va" onClick={()=>updateVehicleStatus(v.id,"available")}>Relist</button>}
                    {v.status==="available"  && <button className="ps-va ps-va--ghost" onClick={()=>updateVehicleStatus(v.id,"unavailable")}>Unavailable</button>}
                  </div>
                  <div className="ps-vcard-mgmt">
                    <button className="ps-vm" onClick={()=>startEdit(v)}>Edit</button>
                    <button className="ps-vm ps-vm--del" onClick={()=>deleteVehicle(v.id)}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
