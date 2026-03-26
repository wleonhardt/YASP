import type { PublicRoomState } from "@yasp/shared";
import { getMedian, getNumericVotes, getSpread } from "../lib/room";

type Props = {
  state: PublicRoomState;
};

export function ResultsPanel({ state }: Props) {
  const stats = state.stats;

  if (!stats || stats.totalVotes === 0) {
    return (
      <section className="app-panel results-panel">
        <div className="section-header">
          <div>
            <div className="section-label">Results</div>
            <h2>No votes yet</h2>
          </div>
        </div>
      </section>
    );
  }

  const numericVotes = getNumericVotes(state);
  const median = getMedian(numericVotes);
  const spread = getSpread(numericVotes);
  const distribution = Object.entries(stats.distribution).sort(([, a], [, b]) => b - a);
  const highestCount = distribution[0]?.[1] ?? 1;

  return (
    <section className="app-panel results-panel">
      <div className="section-header">
        <div>
          <div className="section-label">Results</div>
          <h2>Revealed votes</h2>
        </div>
        <div className="results-panel__note">
          {stats.consensus ? "Consensus reached" : "No consensus yet"}
        </div>
      </div>

      <div className="stats-grid">
        <StatTile
          label="Average"
          value={
            stats.numericAverage !== null ? stats.numericAverage.toFixed(1) : "n/a"
          }
        />
        <StatTile
          label="Median"
          value={median !== null ? median.toFixed(1).replace(/\.0$/, "") : "n/a"}
        />
        <StatTile
          label="Most common"
          value={stats.mostCommon ?? "Tie"}
          meta={stats.consensus ? "Consensus" : "Plurality"}
        />
        <StatTile
          label="Spread"
          value={spread !== null ? spread.toFixed(1).replace(/\.0$/, "") : "n/a"}
        />
      </div>

      <div className="results-panel__distribution">
        <div className="section-label">Distribution</div>
        <div className="distribution-list">
          {distribution.map(([label, count]) => (
            <div key={label} className="distribution-row">
              <div className="distribution-row__label">
                <strong>{label}</strong>
                <span>{count}</span>
              </div>
              <div className="distribution-row__bar">
                <div
                  className="distribution-row__fill"
                  style={{ width: `${(count / highestCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">{label}</div>
      <div className="stat-tile__value">{value}</div>
      {meta && <div className="stat-tile__meta">{meta}</div>}
    </div>
  );
}
