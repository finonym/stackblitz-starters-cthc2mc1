"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";

type Vehicle = {
  id: string;
  tenant_id: string;
  inventory_type: "new" | "used";
  make: string;
  model: string;
  variant: string | null;
  model_year: number | null;
  fuel_type: string | null;
  transmission: string | null;
  body_type: string | null;
  price_amount: number | null;
  currency: string;
  odometer_km: number | null;
  owners_count: number | null;
  color: string | null;
  status: "available" | "reserved" | "sold" | "inactive";
  created_at: string;
};

export default function Page() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
  
      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id, tenant_id, inventory_type, make, model, variant, model_year, fuel_type, transmission, body_type, price_amount, currency, odometer_km, owners_count, color, status, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(50);
  
      if (error) {
        setErr(error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as Vehicle[]);
      }
  
      setLoading(false);
    })();
  }, []);
  
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Inventory</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Showing latest vehicles (max 50)
      </p>

      {loading && <p>Loading…</p>}

      {!loading && err && (
        <div style={{ padding: 12, border: "1px solid #f5c2c7", background: "#f8d7da", borderRadius: 10 }}>
          <strong>Error:</strong> {err}
          <div style={{ marginTop: 6, color: "#6b0000" }}>
            If this says “permission denied” or “RLS”, we’ll add the safe RPC next.
          </div>
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          No vehicles found yet.
        </div>
      )}

      {!loading && !err && rows.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                {["Type", "Vehicle", "Year", "Price", "Odometer", "Status", "Tenant", "Created"].map((h) => (
                  <th key={h} style={{ padding: 10, borderBottom: "1px solid #ddd", fontSize: 12, color: "#444" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                    {v.inventory_type.toUpperCase()}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                    <div style={{ fontWeight: 600 }}>
                      {v.make} {v.model}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {v.variant ?? "—"} • {v.fuel_type ?? "—"} • {v.transmission ?? "—"} • {v.body_type ?? "—"} • {v.color ?? "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "#777" }}>ID: {v.id}</div>
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{v.model_year ?? "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                    {v.price_amount != null ? `${v.currency} ${Number(v.price_amount).toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                    {v.odometer_km != null ? `${v.odometer_km.toLocaleString()} km` : "—"}
                    {v.owners_count != null ? <div style={{ fontSize: 12, color: "#666" }}>{v.owners_count} owner(s)</div> : null}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid #ddd", fontSize: 12 }}>
                      {v.status}
                    </span>
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12, color: "#555" }}>
                    {v.tenant_id}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12, color: "#555" }}>
                    {new Date(v.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}