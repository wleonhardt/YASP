import type { ReactNode, RefObject } from "react";
import { useCallback, useId, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SessionRoundSnapshot } from "@yasp/shared";
import { DeckToken } from "./DeckToken";
import {
  downloadBlob,
  formatRoundReportTime,
  formatSessionExportFilename,
  sessionToCsv,
  sessionToJson,
} from "../lib/roundReport";

export type SessionReportModalMode = "moderator" | "participant";

type Props = {
  open: boolean;
  roomId: string;
  sessionRounds: SessionRoundSnapshot[];
  mode: SessionReportModalMode;
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
  if (value === null) return fallback;
  return value.toFixed(1).replace(/\.0$/, "");
}

function isNumericVoteStr(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(parsed) === value;
}

function computeMedian(values: number[]): number | null {
  const nums = [...values].sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? ((nums[mid - 1] ?? 0) + (nums[mid] ?? 0)) / 2 : (nums[mid] ?? null);
}

export function SessionReportModal({ open, roomId, sessionRounds, mode, onClose, returnFocusRef }: Props) {
  const { t, i18n } = useTranslation();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  const isModeratorMode = mode === "moderator";
  const modalTitle = isModeratorMode ? t("room.sessionReport.title") : t("room.sessionReport.summaryTitle");
  const closeLabel = isModeratorMode ? t("room.sessionReport.close") : t("room.sessionReport.closeSummary");

  useLayoutEffect(() => {
    if (!open) return;

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

      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled")
      );

      if (focusable.length === 0) return;

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
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (modalRef.current?.contains(target)) return;
      onClose();
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [onClose, open]);

  const handleExportCsv = useCallback(() => {
    const csv = sessionToCsv(sessionRounds, i18n.language);
    downloadBlob(formatSessionExportFilename(roomId, "csv"), csv, "text/csv;charset=utf-8");
  }, [i18n.language, roomId, sessionRounds]);

  const handleExportJson = useCallback(() => {
    const json = sessionToJson(sessionRounds);
    downloadBlob(formatSessionExportFilename(roomId, "json"), json, "application/json");
  }, [roomId, sessionRounds]);

  const handlePrint = useCallback(() => {
    if (typeof window === "undefined") return;
    document.body.classList.add(PRINTING_BODY_CLASS);
    try {
      window.print();
    } finally {
      window.setTimeout(() => document.body.classList.remove(PRINTING_BODY_CLASS), 0);
    }
  }, []);

  if (!open || sessionRounds.length === 0) return null;

  const notAvailable = t("room.notAvailable");

  return (
    <div className="modal-backdrop">
      <div
        ref={modalRef}
        className="deck-modal round-report-modal session-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
      >
        <div className="deck-modal__header">
          <div className="deck-modal__title-group">
            <h2 id={titleId}>{modalTitle}</h2>
            <p id={subtitleId} className="deck-modal__subtitle">
              {t("room.sessionReport.meta", { count: sessionRounds.length })}
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
          {sessionRounds.map((snap) => (
            <SessionRoundSection
              key={snap.roundNumber}
              snap={snap}
              locale={i18n.language}
              notAvailable={notAvailable}
              t={t}
            />
          ))}

          {isModeratorMode && (
            <p className="round-report-modal__footer-note">{t("room.sessionReport.ephemeralNote")}</p>
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

function SessionRoundSection({
  snap,
  locale,
  notAvailable,
  t,
}: {
  snap: SessionRoundSnapshot;
  locale: string;
  notAvailable: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const statsId = useId();
  const votesId = useId();

  const numericVotes = snap.participants
    .map((p) => p.vote)
    .filter((v): v is string => v !== null && isNumericVoteStr(v))
    .map(Number);
  const median = computeMedian(numericVotes);

  const revealedAtLabel = formatRoundReportTime(snap.revealedAt, locale);
  const consensusStateLabel = snap.stats.consensus ? t("room.consensusReached") : t("room.noConsensus");
  const mostCommonMeta = snap.stats.consensus ? t("room.consensus") : t("room.plurality");
  const distribution = Object.entries(snap.stats.distribution).sort(([, a], [, b]) => b - a);
  const distributionMax = distribution[0]?.[1] ?? 1;

  const voters = snap.participants
    .filter((p) => p.role === "voter" || p.vote !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="session-report-modal__round" aria-labelledby={statsId}>
      <div className="session-report-modal__round-header">
        <h3 id={statsId} className="session-report-modal__round-title">
          {t("room.roundReport.meta", { round: snap.roundNumber, time: revealedAtLabel })}
        </h3>
        <span className="round-report-modal__deck-meta">
          {t("room.roundReport.deck", { deck: snap.deck.label })}
        </span>
        {snap.storyLabel ? (
          <span className="round-report-modal__deck-meta">
            {t("room.roundReport.story", { story: snap.storyLabel })}
          </span>
        ) : null}
      </div>

      <div className="round-report-modal__stat-grid">
        <StatTile
          label={t("room.average")}
          value={snap.stats.numericAverage !== null ? String(snap.stats.numericAverage) : notAvailable}
        />
        <StatTile label={t("room.median")} value={formatNumber(median, notAvailable)} />
        <StatTile
          label={t("room.mostCommon")}
          value={snap.stats.mostCommon !== null ? <DeckToken token={snap.stats.mostCommon} /> : t("room.tie")}
          meta={mostCommonMeta}
        />
        <StatTile
          label={t("room.consensus")}
          value={
            <span
              className={[
                "round-report-modal__consensus-indicator",
                snap.stats.consensus
                  ? "round-report-modal__consensus-indicator--reached"
                  : "round-report-modal__consensus-indicator--split",
              ].join(" ")}
              role="img"
              aria-label={consensusStateLabel}
            >
              <span aria-hidden="true">{snap.stats.consensus ? "✓" : "≠"}</span>
            </span>
          }
          meta={
            <span className="round-report-modal__consensus-meta">
              <span>{consensusStateLabel}</span>
              <span className="round-report-modal__consensus-meta-count">
                {t("room.roundReport.totalVotes", { count: snap.stats.totalVotes })}
              </span>
            </span>
          }
        />
      </div>

      <section aria-labelledby={votesId}>
        <div className="results-panel__section-header">
          <div className="section-label">{t("room.roundReport.votes")}</div>
          <h4 id={votesId} className="results-panel__section-title">
            {t("room.roundReport.votes")}
          </h4>
        </div>
        {voters.length === 0 ? (
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
              {voters.map((voter) => (
                <tr key={voter.participantId}>
                  <td>{voter.name}</td>
                  <td>{voter.role === "spectator" ? t("roles.spectator.label") : t("roles.voter.label")}</td>
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

      {distribution.length > 0 && (
        <div className="distribution-list session-report-modal__distribution">
          {distribution.map(([label, count]) => (
            <div key={label} className="distribution-row">
              <div className="distribution-row__label">
                <strong>
                  <DeckToken token={label} />
                </strong>
                <span className="distribution-row__count">{count}</span>
              </div>
              <div className="distribution-row__bar">
                <div
                  className="distribution-row__fill"
                  style={{ width: `${(count / distributionMax) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
