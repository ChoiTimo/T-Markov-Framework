function Dashboard() {
  return (
    <div>
      <h2>SmartWAN Platform</h2>
      <p style={{ color: "#64748b", marginTop: 8 }}>
        Phase 0 — Infrastructure Setup Complete
      </p>
      <div
        style={{
          marginTop: 32,
          padding: 24,
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
        }}
      >
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Roadmap Status</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { phase: "Phase 0", status: "In Progress", color: "#60a5fa" },
            { phase: "Phase 1", status: "Pending", color: "#94a3b8" },
            { phase: "Phase 2", status: "Pending", color: "#94a3b8" },
            { phase: "Phase 3", status: "Pending", color: "#94a3b8" },
          ].map((p) => (
            <div
              key={p.phase}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: `2px solid ${p.color}`,
                minWidth: 140,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.phase}</div>
              <div style={{ fontSize: 12, color: p.color, marginTop: 4 }}>
                {p.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
