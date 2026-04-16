import type { ReactNode, RefObject } from "react";
import { useCallback, useId, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DeckToken } from "./DeckToken";
import {
  buildRoundReport,
  downloadBlob,
  formatRoundReportTime,
  formatExportFilename,
  toCsv,
  toJson,
  type RoundReport,
} from "../lib/roundReport";
import type { PublicRoomState } from "@yasp/shared";

export type RoundReportModalMode = "moderator" | "participant";

type Props = {
  open: boolean;
  state: PublicRoomState;
  revealedAt: number;
  mode: RoundReportModalMode;
  onClose(): void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

const PRINTING_BODY_CLASS = "round-report-printing";

function resolveReturnFocusTarget(
  returnFocusRef: RefObject<HTMLElement | null> | undefined,
  previousActive: HTMLElement | null
) {
  if (returnFocusRef?.current && returnFocusRef.current.isConnected) {
    return returnFocusRef.current;
  }

  if (previousActive?.isConnected) {
    return previousActive;
  }

  return null;
}

function formatNumber(value: number | null, fallback: string): string {
  if (value === null) {
    return fallback;
  }
  return value.toFixed(1).replace(/\.0$/, "");
}

export function RoundReportModal({ open, state, revealedAt, mode, onClose, returnFocusRef }: Props) {
  const { t, i18n } = useTranslation();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();
  const statsHeadingId = useId();
  const votesHeadingId = useId();
  const distributionHeadingId = useId();

  const isModeratorMode = mode === "moderator";
  const report: RoundReport | null = useMemo(() => {
    if (!open) {
      return null;
    }
    return buildRoundReport(state, revealedAt);
  }, [open, state, revealedAt]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled")
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);

      window.requestAnimationFrame(() => {
        resolveReturnFocusTarget(returnFocusRef, previousActive)?.focus();
      });
    };
  }, [onClose, open, returnFocusRef]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (modalRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [onClose, open]);

  const handleExportCsv = useCallback(() => {
    if (!report) return;
    downloadBlob(formatExportFilename(report, "csv"), toCsv(report), "text/csv;charset=utf-8");
  }, [report]);

  const handleExportJson = useCallback(() => {
    if (!report) return;
    downloadBlob(formatExportFilename(report, "json"), toJson(report), "application/json");
  }, [report]);

  const handlePrint = useCallback(() => {
    if (typeof window === "undefined") return;
    document.body.classList.add(PRINTING_BODY_CLASS);
    try {
      window.print();
    } finally {
      // Remove on the next tick so the print dialog has already captured
      // the styled snapshot. Some browsers fire afterprint asynchronously;
      // the class-removal here is the synchronous fallback.
      window.setTimeout(() => document.body.classList.remove(PRINTING_BODY_CLASS), 0);
    }
  }, []);

  if (!open || !report) {
    return null;
  }

  const notAvailable = t("room.notAvailable");
  const averageValue =
    report.stats.numericAverage !== null ? String(report.stats.numericAverage) : notAvailable;
  const medianValue = formatNumber(report.stats.median, notAvailable);
  const mostCommonValue = report.stats.mostCommon ?? t("room.tie");
  const mostCommonMeta = report.stats.consensus ? t("room.consensus") : t("room.plurality");
  const consensusStateLabel = report.stats.consensus ? t("room.consensusReached") : t("room.noConsensus");
  const revealedAtLabel = formatRoundReportTime(report.revealedAt, i18n.language);
  const distributionMax = report.stats.distribution[0]?.count ?? 1;
  const hasNonNumericVotes = report.voters.some((voter) => voter.vote !== null && !voter.voteIsNumeric);
  const modalTitle = isModeratorMode ? t("room.roundReport.title") : t("room.roundReport.summaryTitle");
  const closeLabel = isModeratorMode ? t("room.roundReport.close") : t("room.roundReport.closeSummary");

  return (
    <div className="modal-backdrop">
      <div
        ref={modalRef}
        className="deck-modal round-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
      >
        <div className="deck-modal__header">
          <div className="deck-modal__title-group">
            <h2 id={titleId}>{modalTitle}</h2>
            <p id={subtitleId} className="deck-modal__subtitle">
              {t("room.roundReport.meta", {
                round: report.roundNumber,
                time: revealedAtLabel,
              })}
            </p>
            <p className="round-report-modal__deck-meta">
              {t("room.roundReport.deck", { deck: report.deckLabel })}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            className="deck-modal__close"
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="deck-modal__body round-report-modal__body">
          <section className="round-report-modal__stats" aria-labelledby={statsHeadingId}>
            <h3 id={statsHeadingId} className="sr-only">
              {t("room.keyStats")}
            </h3>
            <div className="round-report-modal__stat-grid">
              <StatTile label={t("room.average")} value={averageValue} />
              <StatTile label={t("room.median")} value={medianValue} />
              <StatTile
                label={t("room.mostCommon")}
                value={
                  report.stats.mostCommon !== null ? (
                    <DeckToken token={report.stats.mostCommon} />
                  ) : (
                    mostCommonValue
                  )
                }
                meta={mostCommonMeta}
              />
              <StatTile
                label={t("room.consensus")}
                value={
                  <span
                    className={[
                      "round-report-modal__consensus-indicator",
                      report.stats.consensus
                        ? "round-report-modal__consensus-indicator--reached"
                        : "round-report-modal__consensus-indicator--split",
                    ].join(" ")}
                    role="img"
                    aria-label={consensusStateLabel}
                  >
                    <span aria-hidden="true">{report.stats.consensus ? "✓" : "≠"}</span>
                  </span>
                }
                meta={
                  <span className="round-report-modal__consensus-meta">
                    <span>{consensusStateLabel}</span>
                    <span className="round-report-modal__consensus-meta-count">
                      {t("room.roundReport.totalVotes", { count: report.stats.totalVotes })}
                    </span>
                  </span>
                }
              />
            </div>
          </section>

          {hasNonNumericVotes && (
            <p className="round-report-modal__footer-note">{t("room.roundReport.nonNumericNote")}</p>
          )}

          <section className="round-report-modal__votes" aria-labelledby={votesHeadingId}>
            <div className="results-panel__section-header">
              <div className="section-label">{t("room.roundReport.votes")}</div>
              <h3 id={votesHeadingId} className="results-panel__section-title">
                {t("room.roundReport.votes")}
              </h3>
            </div>
            {report.voters.length === 0 ? (
              <p className="round-report-modal__empty">{t("room.noVotesYet")}</p>
            ) : (
              <table className="round-report-modal__table">
                <thead>
                  <tr>
                    <th scope="col">{t("room.roundReport.participantColumn")}</th>
                    <th scope="col">{t("room.roundReport.roleColumn")}</th>
                    <th scope="col">{t("room.roundReport.voteColumn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.voters.map((voter) => (
                    <tr key={voter.participantId}>
                      <td>{voter.name}</td>
                      <td>
                        {voter.role === "spectator" ? t("roles.spectator.label") : t("roles.voter.label")}
                      </td>
                      <td>
                        {voter.vote !== null ? (
                          <DeckToken token={voter.vote} />
                        ) : (
                          <span className="round-report-modal__vote-missing">
                            {t("room.participant.notVoted")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="round-report-modal__distribution" aria-labelledby={distributionHeadingId}>
            <div className="results-panel__section-header">
              <div className="section-label">{t("room.distribution")}</div>
              <h3 id={distributionHeadingId} className="results-panel__section-title">
                {t("room.distribution")}
              </h3>
            </div>
            <div className="distribution-list">
              {report.stats.distribution.map((entry) => (
                <div key={entry.value} className="distribution-row">
                  <div className="distribution-row__label">
                    <strong>
                      <DeckToken token={entry.value} />
                    </strong>
                    <span className="distribution-row__count">{entry.count}</span>
                  </div>
                  <div className="distribution-row__bar">
                    <div
                      className="distribution-row__fill"
                      style={{ width: `${(entry.count / distributionMax) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {isModeratorMode && (
            <p className="round-report-modal__footer-note">{t("room.roundReport.ephemeralNote")}</p>
          )}
        </div>

        <div className="deck-modal__footer round-report-modal__footer">
          <div className="deck-modal__footer-actions">
            {isModeratorMode && (
              <>
                <button className="button button--secondary" type="button" onClick={handleExportCsv}>
                  {t("room.roundReport.exportCsv")}
                </button>
                <button className="button button--secondary" type="button" onClick={handleExportJson}>
                  {t("room.roundReport.exportJson")}
                </button>
                <button className="button button--secondary" type="button" onClick={handlePrint}>
                  {t("room.roundReport.print")}
                </button>
              </>
            )}
            <button className="button button--primary" type="button" onClick={onClose}>
              {t("room.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, meta }: { label: string; value: ReactNode; meta?: ReactNode }) {
  return (
    <div className="stat-tile stat-tile--supporting round-report-modal__stat-tile">
      <div className="stat-tile__label">{label}</div>
      <div className="stat-tile__value stat-tile__value--supporting">{value}</div>
      {meta && <div className="stat-tile__meta">{meta}</div>}
    </div>
  );
}
