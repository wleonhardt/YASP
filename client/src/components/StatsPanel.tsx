import type { RevealStats } from "@yasp/shared";

type Props = {
  stats: RevealStats;
};

export function StatsPanel({ stats }: Props) {
  if (stats.totalVotes === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          color: "var(--color-text-muted)",
          padding: 16,
        }}
      >
        No votes were cast
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 16,
        borderRadius: "var(--radius-lg)",
        background: "var(--color-surface)",
        marginTop: 16,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        Results
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12,
        }}
      >
        {stats.numericAverage !== null && (
          <StatBox
            label="Average"
            value={stats.numericAverage.toFixed(1)}
          />
        )}
        {stats.mostCommon !== null && (
          <StatBox label="Most Common" value={stats.mostCommon} />
        )}
        <StatBox label="Total Votes" value={String(stats.totalVotes)} />
        <StatBox
          label="Consensus"
          value={stats.consensus ? "Yes" : "No"}
        />
      </div>

      {/* Distribution */}
      <div style={{ marginTop: 16 }}>
        <h4
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-muted)",
            marginBottom: 8,
          }}
        >
          Distribution
        </h4>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(stats.distribution)
            .sort(([, a], [, b]) => b - a)
            .map(([label, count]) => (
              <div
                key={label}
                style={{
                  padding: "4px 12px",
                  borderRadius: "var(--radius)",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  fontSize: 14,
                }}
              >
                <strong>{label}</strong>
                <span style={{ color: "var(--color-text-muted)", marginLeft: 6 }}>
                  x{count}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: "var(--radius)",
        background: "var(--color-bg)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
