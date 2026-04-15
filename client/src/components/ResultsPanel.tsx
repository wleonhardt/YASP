import { useId, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { DeckToken } from "./DeckToken";
import { getMedian, getNumericVotes, getSpread, isMeModerator } from "../lib/room";

type Props = {
  state: PublicRoomState;
  onOpenRoundReport?: () => void;
  roundReportButtonRef?: Ref<HTMLButtonElement>;
};

function formatOptionalStat(value: number | null, fallback: string): string {
  if (value === null) {
    return fallback;
  }

  return value.toFixed(1).replace(/\.0$/, "");
}

export function ResultsPanel({ state, onOpenRoundReport, roundReportButtonRef }: Props) {
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
  const notAvailableLabel = t("room.notAvailable");
  const resultsLabel = t("room.results");
  const distributionLabel = t("room.distribution");
  const keyStatsLabel = t("room.keyStats");
  const averageLabel = t("room.average");
  const medianLabel = t("room.median");
  const mostCommonLabel = t("room.mostCommon");
  const spreadLabel = t("room.spread");
  const consensusStateLabel = stats.consensus ? t("room.consensusReached") : t("room.noConsensus");
  const averageValue = stats.numericAverage !== null ? String(stats.numericAverage) : notAvailableLabel;
  const medianValue = formatOptionalStat(median, notAvailableLabel);
  const mostCommonValue = stats.mostCommon !== null ? <DeckToken token={stats.mostCommon} /> : t("room.tie");
  const spreadValue = formatOptionalStat(spread, notAvailableLabel);

  return (
    <section className="app-panel results-panel" aria-labelledby={headingId}>
      <ResultsHeader
        headingId={headingId}
        consensus={stats.consensus}
        consensusStateLabel={consensusStateLabel}
        resultsLabel={resultsLabel}
        revealedVotesLabel={t("room.revealedVotes")}
      />
      <KeyStatsCard
        sectionId={keyStatsId}
        average={averageValue}
        averageLabel={averageLabel}
        keyStatsLabel={keyStatsLabel}
        median={medianValue}
        medianLabel={medianLabel}
      />
      <SecondaryStats
        mostCommon={mostCommonValue}
        mostCommonLabel={mostCommonLabel}
        mostCommonMeta={stats.consensus ? t("room.consensus") : t("room.plurality")}
        spread={spreadValue}
        spreadLabel={spreadLabel}
      />
      <DistributionSection
        sectionId={distributionId}
        distribution={distribution}
        distributionLabel={distributionLabel}
        highestCount={highestCount}
      />
      {onOpenRoundReport && isMeModerator(state) && (
        <div className="results-panel__footer">
          <button
            ref={roundReportButtonRef}
            type="button"
            className="button button--secondary"
            onClick={onOpenRoundReport}
          >
            {t("room.roundReport.openButton")}
          </button>
        </div>
      )}
    </section>
  );
}

function ResultsHeader({
  consensus,
  consensusStateLabel,
  headingId,
  resultsLabel,
  revealedVotesLabel,
}: {
  consensus: boolean;
  consensusStateLabel: string;
  headingId: string;
  resultsLabel: string;
  revealedVotesLabel: string;
}) {
  return (
    <div className="section-header results-panel__header">
      <div>
        <div className="section-label">{resultsLabel}</div>
        <h2 id={headingId}>{revealedVotesLabel}</h2>
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
        <span>{consensusStateLabel}</span>
      </div>
    </div>
  );
}

function KeyStatsCard({
  average,
  averageLabel,
  keyStatsLabel,
  median,
  medianLabel,
  sectionId,
}: {
  average: string;
  averageLabel: string;
  keyStatsLabel: string;
  median: string;
  medianLabel: string;
  sectionId: string;
}) {
  return (
    <section className="results-panel__key-card" aria-labelledby={sectionId}>
      <div className="results-panel__section-header">
        <div className="section-label">{keyStatsLabel}</div>
        <h3 id={sectionId} className="results-panel__section-title">
          {keyStatsLabel}
        </h3>
      </div>

      <div className="results-panel__key-grid">
        <StatTile label={averageLabel} value={average} emphasis="hero" />
        <StatTile label={medianLabel} value={median} emphasis="hero" />
      </div>
    </section>
  );
}

function SecondaryStats({
  mostCommon,
  mostCommonLabel,
  mostCommonMeta,
  spread,
  spreadLabel,
}: {
  mostCommon: ReactNode;
  mostCommonLabel: string;
  mostCommonMeta: string;
  spread: string;
  spreadLabel: string;
}) {
  return (
    <div className="results-panel__secondary-grid">
      <StatTile label={mostCommonLabel} value={mostCommon} meta={mostCommonMeta} />
      <StatTile label={spreadLabel} value={spread} />
    </div>
  );
}

function DistributionSection({
  distributionLabel,
  sectionId,
  distribution,
  highestCount,
}: {
  distributionLabel: string;
  sectionId: string;
  distribution: Array<[string, number]>;
  highestCount: number;
}) {
  return (
    <section className="results-panel__distribution" aria-labelledby={sectionId}>
      <div className="results-panel__section-header">
        <div className="section-label">{distributionLabel}</div>
        <h3 id={sectionId} className="results-panel__section-title">
          {distributionLabel}
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
