import { useId, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { DeckToken } from "./DeckToken";
import { RoundSpotlight } from "./RoundSpotlight";
import {
  getAlmostConsensusCallout,
  getMedian,
  getNumericVotes,
  getOutlierCallout,
  getSpread,
  isMeModerator,
} from "../lib/room";

type Props = {
  state: PublicRoomState;
  onOpenRoundReport?: () => void;
  onCopyRoundSummary?: () => void | Promise<void>;
  roundReportButtonRef?: Ref<HTMLButtonElement>;
  onOpenSessionReport?: () => void;
  onCopySessionSummary?: () => void | Promise<void>;
  sessionReportButtonRef?: Ref<HTMLButtonElement>;
};

type DistributionEntry = {
  count: number;
  isMode: boolean;
  kind: "numeric" | "nonNumeric";
  token: string;
};

function formatOptionalStat(value: number | null, fallback: string): string {
  if (value === null) {
    return fallback;
  }

  return value.toFixed(1).replace(/\.0$/, "");
}

function isNumericToken(token: string): boolean {
  return token.trim() !== "" && Number.isFinite(Number(token));
}

function buildDistributionEntries({
  deckCards,
  distribution,
  mostCommon,
}: {
  deckCards: string[];
  distribution: Record<string, number>;
  mostCommon: string | null;
}): DistributionEntry[] {
  const deckCardSet = new Set(deckCards);
  const unexpectedVoteTokens = Object.keys(distribution).filter((token) => !deckCardSet.has(token));
  const tokens = [...deckCards, ...unexpectedVoteTokens];
  const entries = tokens.map((token) => ({
    token,
    count: distribution[token] ?? 0,
    isMode: mostCommon !== null && token === mostCommon,
    kind: isNumericToken(token) ? ("numeric" as const) : ("nonNumeric" as const),
  }));

  return [
    ...entries.filter((entry) => entry.kind === "numeric"),
    ...entries.filter((entry) => entry.kind === "nonNumeric"),
  ];
}

export function ResultsPanel({
  state,
  onCopyRoundSummary,
  onOpenRoundReport,
  roundReportButtonRef,
  onOpenSessionReport,
  onCopySessionSummary,
  sessionReportButtonRef,
}: Props) {
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
            <h2 id={headingId}>{t("room.noVotesYet")}</h2>
          </div>
        </div>
      </section>
    );
  }

  const numericVotes = getNumericVotes(state);
  const median = getMedian(numericVotes);
  const spread = getSpread(numericVotes);
  const distribution = buildDistributionEntries({
    deckCards: state.deck.cards,
    distribution: stats.distribution,
    mostCommon: stats.mostCommon,
  });
  const highestCount = Math.max(1, ...distribution.map((entry) => entry.count));
  const notAvailableLabel = t("room.notAvailable");
  const distributionLabel = t("room.distribution");
  const keyStatsLabel = t("room.keyStats");
  const averageLabel = t("room.average");
  const medianLabel = t("room.median");
  const mostCommonLabel = t("room.mode");
  const spreadLabel = t("room.spread");
  const consensusStateLabel = stats.consensus ? t("room.consensusReached") : t("room.noConsensus");
  const averageValue = stats.numericAverage !== null ? String(stats.numericAverage) : notAvailableLabel;
  const medianValue = formatOptionalStat(median, notAvailableLabel);
  const mostCommonValue = stats.mostCommon !== null ? <DeckToken token={stats.mostCommon} /> : t("room.tie");
  const spreadValue = formatOptionalStat(spread, notAvailableLabel);
  const roundSpotlight = getOutlierCallout(state) ?? getAlmostConsensusCallout(state);
  const isModerator = isMeModerator(state);
  const reportMode = isModerator ? "moderator" : "participant";
  const reportButtonLabel =
    reportMode === "moderator" ? t("room.roundReport.openButton") : t("room.roundReport.openSummaryButton");
  const reportHelperLabel =
    reportMode === "moderator"
      ? t("room.roundReport.footerNoteModerator")
      : t("room.roundReport.footerNoteParticipant");
  const copySummaryHandler = isModerator ? onCopyRoundSummary : undefined;
  const showCopySummary = typeof copySummaryHandler === "function";
  const showRoundDetailNote = typeof onOpenRoundReport === "function";
  const hasSessionRounds = state.sessionRounds.length > 0;
  const copySessionSummaryHandler = isModerator ? onCopySessionSummary : undefined;
  const showCopySessionSummary = typeof copySessionSummaryHandler === "function";
  const sessionButtonLabel = isModerator
    ? t("room.sessionReport.openButton")
    : t("room.sessionReport.openSummaryButton");

  return (
    <section className="app-panel results-panel" aria-labelledby={headingId}>
      <ResultsHeader
        headingId={headingId}
        consensus={stats.consensus}
        consensusStateLabel={consensusStateLabel}
        revealedVotesLabel={t("room.revealedVotes")}
      />
      <StatsStrip
        sectionId={keyStatsId}
        average={averageValue}
        averageLabel={averageLabel}
        keyStatsLabel={keyStatsLabel}
        median={medianValue}
        medianLabel={medianLabel}
        mostCommon={mostCommonValue}
        mostCommonLabel={mostCommonLabel}
        mostCommonMeta={stats.consensus ? t("room.consensus") : t("room.plurality")}
        spread={spreadValue}
        spreadLabel={spreadLabel}
      />
      {roundSpotlight && <RoundSpotlight callout={roundSpotlight} />}
      <DistributionSection
        sectionId={distributionId}
        distribution={distribution}
        distributionLabel={distributionLabel}
        highestCount={highestCount}
      />
      {(showCopySummary || onOpenRoundReport) && (
        <div className="results-panel__footer">
          <div className="results-panel__footer-actions">
            {showCopySummary && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void copySummaryHandler()}
              >
                {t("room.roundReport.copySummary")}
              </button>
            )}
            {onOpenRoundReport && (
              <button
                ref={roundReportButtonRef}
                type="button"
                className="button button--secondary"
                onClick={onOpenRoundReport}
              >
                {reportButtonLabel}
              </button>
            )}
          </div>
          {showRoundDetailNote && <p className="results-panel__footer-note">{reportHelperLabel}</p>}
        </div>
      )}
      {hasSessionRounds && (onOpenSessionReport || showCopySessionSummary) && (
        <div className="results-panel__footer results-panel__footer--session">
          <div className="results-panel__footer-actions">
            {showCopySessionSummary && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void copySessionSummaryHandler()}
              >
                {t("room.sessionReport.copySummary")}
              </button>
            )}
            {onOpenSessionReport && (
              <button
                ref={sessionReportButtonRef}
                type="button"
                className="button button--secondary"
                onClick={onOpenSessionReport}
              >
                {sessionButtonLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ResultsHeader({
  consensus,
  consensusStateLabel,
  headingId,
  revealedVotesLabel,
}: {
  consensus: boolean;
  consensusStateLabel: string;
  headingId: string;
  revealedVotesLabel: string;
}) {
  return (
    <div className="section-header results-panel__header">
      <div>
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
        role="status"
        aria-live="polite"
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

function StatsStrip({
  average,
  averageLabel,
  keyStatsLabel,
  median,
  medianLabel,
  mostCommon,
  mostCommonLabel,
  mostCommonMeta,
  sectionId,
  spread,
  spreadLabel,
}: {
  average: string;
  averageLabel: string;
  keyStatsLabel: string;
  median: string;
  medianLabel: string;
  mostCommon: ReactNode;
  mostCommonLabel: string;
  mostCommonMeta: string;
  sectionId: string;
  spread: string;
  spreadLabel: string;
}) {
  return (
    <section className="results-panel__stats" aria-labelledby={sectionId}>
      <div className="results-panel__section-header">
        <div className="section-label">{keyStatsLabel}</div>
        <h3 id={sectionId} className="results-panel__section-title">
          {keyStatsLabel}
        </h3>
      </div>

      <div className="results-panel__stat-strip">
        <StatFigure label={averageLabel} value={average} />
        <StatFigure label={medianLabel} value={median} />
        <StatFigure label={mostCommonLabel} value={mostCommon} meta={mostCommonMeta} />
        <StatFigure label={spreadLabel} value={spread} />
      </div>
    </section>
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
  distribution: DistributionEntry[];
  highestCount: number;
}) {
  const firstNonNumericIndex = distribution.findIndex((entry) => entry.kind === "nonNumeric");
  const hasNumericRegion = distribution.some((entry) => entry.kind === "numeric");
  const hasNonNumericRegion = firstNonNumericIndex !== -1;

  return (
    <section className="results-panel__distribution" aria-labelledby={sectionId}>
      <div className="results-panel__section-header">
        <div className="section-label">{distributionLabel}</div>
        <h3 id={sectionId} className="results-panel__section-title">
          {distributionLabel}
        </h3>
      </div>

      <div className="distribution-chart" role="list">
        {distribution.map((entry, index) => {
          const barHeight = entry.count === 0 ? 0 : Math.max(12, (entry.count / highestCount) * 100);
          const isSeparatorColumn = hasNumericRegion && hasNonNumericRegion && index === firstNonNumericIndex;

          return (
            <div
              key={entry.token}
              className={[
                "distribution-column",
                entry.isMode ? "distribution-column--mode" : "",
                isSeparatorColumn ? "distribution-column--separator" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="listitem"
            >
              <span className="distribution-column__count">{entry.count}</span>
              <div className="distribution-column__track" aria-hidden="true">
                <div className="distribution-column__bar" style={{ height: `${barHeight}%` }} />
              </div>
              <strong className="distribution-column__label">
                <DeckToken token={entry.token} />
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatFigure({ label, value, meta }: { label: string; value: ReactNode; meta?: string }) {
  return (
    <figure className="results-panel__stat">
      <figcaption className="results-panel__stat-label">{label}</figcaption>
      <div className="results-panel__stat-value">{value}</div>
      {meta && <div className="results-panel__stat-meta">{meta}</div>}
    </figure>
  );
}
