"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/navigation";
import "./pitstop.css";

type Lead = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_interest: string;
  status: string;
  notes: string;
  created_at: string;
  source?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [notifCount, setNotifCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email || "");
      await fetchLeads();
    };
    init();

    const channel = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, (payload) => {
        setLeads((prev) => [payload.new as Lead, ...prev]);
        setNotifCount((n) => n + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from("leads").select("*").order("created_at", { ascending: false });
    if (!error && data) {
      setLeads(data);
      setNotifCount(data.filter((l) => l.status === "new").length);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    await supabase.from("leads").update({ status: newStatus }).eq("id", id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const filteredLeads = activeTab === "all" ? leads : leads.filter((l) => l.status === activeTab);

  const getStatusStyle = (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      new: { bg: "#2d1f00", color: "#fbbf24" },
      contacted: { bg: "#0d1f3c", color: "#60a5fa" },
      closed: { bg: "#0a2218", color: "#34d399" },
      lost: { bg: "#2d0d0d", color: "#f87171" },
    };
    return map[status] || { bg: "#1a1a28", color: "#888899" };
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (!mounted) return null;

  const total = leads.length;
  const newCount = leads.filter((l) => l.status === "new").length;
  const contacted = leads.filter((l) => l.status === "contacted").length;
  const closed = leads.filter((l) => l.status === "closed").length;

  return (
    <div className="pitstop-root">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🏁</div>
          <div>
            <div className="logo-text">PitStop</div>
            <div className="logo-sub">Lead Management</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-label">Main</div>
          <div className="nav-item active">
            <span>📋</span> Leads
            {notifCount > 0 && <span className="nav-badge">{notifCount}</span>}
          </div>
          <div className="nav-item"><span>🚘</span> Inventory</div>
          <div className="nav-item"><span>📊</span> Reports</div>
          <div className="nav-label">Integrations</div>
          <div className="nav-item">
            <span>📘</span> Facebook
            <span className="nav-live">LIVE</span>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="user-avatar">{userEmail ? userEmail[0].toUpperCase() : "D"}</div>
            <div className="user-info">
              <div className="user-email">{userEmail}</div>
              <div className="user-role">Dealer</div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Logout">✕</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-title">Lead Dashboard</div>
          <div className="topbar-right">
            <div className="fb-status">
              <div className="fb-dot"></div>
              Facebook Connected
            </div>
            <div className="notif-btn" onClick={() => setNotifCount(0)}>
              🔔
              {notifCount > 0 && <div className="notif-dot">{notifCount}</div>}
            </div>
          </div>
        </div>

        <div className="content">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-top">
                <div className="stat-icon-wrap orange">🎯</div>
                <span className="stat-change green">All time</span>
              </div>
              <div className="stat-number">{total}</div>
              <div className="stat-label">Total Leads</div>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <div className="stat-icon-wrap yellow">⚡</div>
                {newCount > 0 && <span className="stat-change">Action needed</span>}
              </div>
              <div className="stat-number">{newCount}</div>
              <div className="stat-label">New Leads</div>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <div className="stat-icon-wrap blue">📞</div>
              </div>
              <div className="stat-number">{contacted}</div>
              <div className="stat-label">Contacted</div>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <div className="stat-icon-wrap green">✅</div>
                <span className="stat-change green">Won</span>
              </div>
              <div className="stat-number">{closed}</div>
              <div className="stat-label">Closed Deals</div>
            </div>
          </div>

          <div className="fb-banner">
            <div>
              <div className="fb-banner-title">📘 Facebook Marketplace Integration</div>
              <div className="fb-banner-sub">Connect your Facebook Page to automatically capture leads the moment someone enquires — no manual entry ever.</div>
            </div>
            <button className="fb-connect-btn" onClick={() => alert("We will set this up next!")}>
              Connect Facebook Page →
            </button>
          </div>

          <div className="leads-header">
            <div className="leads-title">All Leads</div>
            <div className="tab-group">
              {["all", "new", "contacted", "closed"].map((tab) => (
                <button key={tab} className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === "new" && newCount > 0 ? ` (${newCount})` : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="leads-table-wrap">
            {loading ? (
              <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-title">Loading leads...</div></div>
            ) : filteredLeads.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏁</div>
                <div className="empty-title">No leads here yet</div>
                <div className="empty-sub">Connect Facebook Marketplace to start receiving leads automatically</div>
              </div>
            ) : (
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Vehicle Interest</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => {
                    const s = getStatusStyle(lead.status);
                    return (
                      <tr key={lead.id}>
                        <td>
                          <div className="lead-name">{lead.customer_name}</div>
                          <div className="lead-email">{lead.customer_email}</div>
                        </td>
                        <td>{lead.customer_phone}</td>
                        <td>{lead.vehicle_interest}</td>
                        <td><span className="source-badge">📘 {lead.source || "Facebook"}</span></td>
                        <td>
                          <select
                            className="status-select"
                            value={lead.status}
                            onChange={(e) => updateStatus(lead.id, e.target.value)}
                            style={{ backgroundColor: s.bg, color: s.color }}
                          >
                            <option value="new">⚡ New</option>
                            <option value="contacted">📞 Contacted</option>
                            <option value="closed">✅ Closed</option>
                            <option value="lost">❌ Lost</option>
                          </select>
                        </td>
                        <td><div className="time-ago">{timeAgo(lead.created_at)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}