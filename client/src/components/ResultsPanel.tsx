import type { ReactNode } from "react";
import type { PublicRoomState } from "@yasp/shared";
import { DeckToken } from "./DeckToken";
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
  const averageValue = stats.numericAverage !== null ? String(stats.numericAverage) : "n/a";
  const medianValue = median !== null ? median.toFixed(1).replace(/\.0$/, "") : "n/a";
  const mostCommonValue = stats.mostCommon !== null ? <DeckToken token={stats.mostCommon} /> : "Tie";
  const spreadValue = spread !== null ? spread.toFixed(1).replace(/\.0$/, "") : "n/a";

  return (
    <section className="app-panel results-panel">
      <ResultsHeader consensus={stats.consensus} />
      <KeyStatsCard average={averageValue} median={medianValue} />
      <SecondaryStats
        mostCommon={mostCommonValue}
        mostCommonMeta={stats.consensus ? "Consensus" : "Plurality"}
        spread={spreadValue}
      />
      <DistributionSection distribution={distribution} highestCount={highestCount} />
    </section>
  );
}

function ResultsHeader({ consensus }: { consensus: boolean }) {
  return (
    <div className="section-header results-panel__header">
      <div>
        <div className="section-label">Results</div>
        <h2>Revealed votes</h2>
      </div>
      <div
        className={[
          "ui-chip",
          "results-panel__consensus",
          consensus ? "ui-chip--success" : "ui-chip--neutral",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {consensus && (
          <span className="results-panel__consensus-icon" aria-hidden="true">
            ✓
          </span>
        )}
        <span>{consensus ? "Consensus reached" : "No consensus"}</span>
      </div>
    </div>
  );
}

function KeyStatsCard({ average, median }: { average: string; median: string }) {
  return (
    <section className="results-panel__key-card" aria-labelledby="results-key-stats">
      <div className="results-panel__section-header">
        <div className="section-label">Key stats</div>
        <h3 id="results-key-stats" className="results-panel__section-title">
          Key stats
        </h3>
      </div>

      <div className="results-panel__key-grid">
        <StatTile label="Average" value={average} emphasis="hero" />
        <StatTile label="Median" value={median} emphasis="hero" />
      </div>
    </section>
  );
}

function SecondaryStats({
  mostCommon,
  mostCommonMeta,
  spread,
}: {
  mostCommon: ReactNode;
  mostCommonMeta: string;
  spread: string;
}) {
  return (
    <div className="results-panel__secondary-grid">
      <StatTile label="Most common" value={mostCommon} meta={mostCommonMeta} />
      <StatTile label="Spread" value={spread} />
    </div>
  );
}

function DistributionSection({
  distribution,
  highestCount,
}: {
  distribution: Array<[string, number]>;
  highestCount: number;
}) {
  return (
    <section className="results-panel__distribution" aria-labelledby="results-distribution">
      <div className="results-panel__section-header">
        <div className="section-label">Distribution</div>
        <h3 id="results-distribution" className="results-panel__section-title">
          Distribution
        </h3>
      </div>

      <div className="distribution-list">
        {distribution.map(([label, count]) => (
          <div key={label} className="distribution-row">
            <div className="distribution-row__label">
              <strong>
                <DeckToken token={label} />
              </strong>
              <span className="distribution-row__count">{count}</span>
            </div>
            <div className="distribution-row__bar">
              <div className="distribution-row__fill" style={{ width: `${(count / highestCount) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  meta,
  emphasis = "supporting",
}: {
  label: string;
  value: ReactNode;
  meta?: string;
  emphasis?: "hero" | "supporting";
}) {
  return (
    <div
      className={["stat-tile", emphasis === "hero" ? "stat-tile--hero" : "stat-tile--supporting"]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="stat-tile__label">{label}</div>
      <div
        className={[
          "stat-tile__value",
          emphasis === "hero" ? "stat-tile__value--hero" : "stat-tile__value--supporting",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </div>
      {meta && <div className="stat-tile__meta">{meta}</div>}
    </div>
  );
}
