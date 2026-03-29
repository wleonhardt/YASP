import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { DeckToken } from "./DeckToken";
import { getMedian, getNumericVotes, getSpread } from "../lib/room";

type Props = {
  state: PublicRoomState;
};

export function ResultsPanel({ state }: Props) {
  const { t } = useTranslation();
  const headingId = useId();
  const keyStatsId = useId();
  const distributionId = useId();
  const stats = state.stats;

  if (!stats || stats.totalVotes === 0) {
    return (
      <section className="app-panel results-panel" aria-labelledby={headingId}>
        <div className="section-header">
          <div>
            <div className="section-label">{t("room.results")}</div>
            <h2 id={headingId}>{t("room.noVotesYet")}</h2>
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
  const averageValue = stats.numericAverage !== null ? String(stats.numericAverage) : t("room.notAvailable");
  const medianValue = median !== null ? median.toFixed(1).replace(/\.0$/, "") : t("room.notAvailable");
  const mostCommonValue = stats.mostCommon !== null ? <DeckToken token={stats.mostCommon} /> : t("room.tie");
  const spreadValue = spread !== null ? spread.toFixed(1).replace(/\.0$/, "") : t("room.notAvailable");

  return (
    <section className="app-panel results-panel" aria-labelledby={headingId}>
      <ResultsHeader headingId={headingId} consensus={stats.consensus} />
      <KeyStatsCard sectionId={keyStatsId} average={averageValue} median={medianValue} />
      <SecondaryStats
        mostCommon={mostCommonValue}
        mostCommonMeta={stats.consensus ? t("room.consensus") : t("room.plurality")}
        spread={spreadValue}
      />
      <DistributionSection
        sectionId={distributionId}
        distribution={distribution}
        highestCount={highestCount}
      />
    </section>
  );
}

function ResultsHeader({ consensus, headingId }: { consensus: boolean; headingId: string }) {
  const { t } = useTranslation();

  return (
    <div className="section-header results-panel__header">
      <div>
        <div className="section-label">{t("room.results")}</div>
        <h2 id={headingId}>{t("room.revealedVotes")}</h2>
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
        <span>{consensus ? t("room.consensusReached") : t("room.noConsensus")}</span>
      </div>
    </div>
  );
}

function KeyStatsCard({
  average,
  median,
  sectionId,
}: {
  average: string;
  median: string;
  sectionId: string;
}) {
  const { t } = useTranslation();

  return (
    <section className="results-panel__key-card" aria-labelledby={sectionId}>
      <div className="results-panel__section-header">
        <div className="section-label">{t("room.keyStats")}</div>
        <h3 id={sectionId} className="results-panel__section-title">
          {t("room.keyStats")}
        </h3>
      </div>

      <div className="results-panel__key-grid">
        <StatTile label={t("room.average")} value={average} emphasis="hero" />
        <StatTile label={t("room.median")} value={median} emphasis="hero" />
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
  const { t } = useTranslation();

  return (
    <div className="results-panel__secondary-grid">
      <StatTile label={t("room.mostCommon")} value={mostCommon} meta={mostCommonMeta} />
      <StatTile label={t("room.spread")} value={spread} />
    </div>
  );
}

function DistributionSection({
  sectionId,
  distribution,
  highestCount,
}: {
  sectionId: string;
  distribution: Array<[string, number]>;
  highestCount: number;
}) {
  const { t } = useTranslation();

  return (
    <section className="results-panel__distribution" aria-labelledby={sectionId}>
      <div className="results-panel__section-header">
        <div className="section-label">{t("room.distribution")}</div>
        <h3 id={sectionId} className="results-panel__section-title">
          {t("room.distribution")}
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
