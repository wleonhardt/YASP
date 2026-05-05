import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { ParticipantCard } from "./ParticipantCard";
import { getConnectedVoterCounts, getRevealedVote } from "../lib/room";

type Props = {
  state: PublicRoomState;
};

export function ParticipantsBoard({ state }: Props) {
  const { t } = useTranslation();
  const headingId = useId();
  const rosterId = useId();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false
  );
  const [mobileExpanded, setMobileExpanded] = useState(() =>
    typeof window !== "undefined" ? !window.matchMedia("(max-width: 720px)").matches : true
  );
  const { voted, total, percent } = getConnectedVoterCounts(state);
  const compact = state.participants.length > 12 || isMobile;
  const overflowCount = Math.max(0, state.participants.length - 8);
  const visibleParticipants =
    overflowCount > 0 ? state.participants.slice(0, 7) : state.participants.slice(0, 8);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");

    const syncViewport = () => {
      const mobile = mediaQuery.matches;
      setIsMobile(mobile);
      setMobileExpanded((current) => (mobile ? current : true));
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  return (
    <section className="app-panel participants-board" aria-labelledby={headingId}>
      <div className="section-header">
        <div>
          <h2 id={headingId}>{t("room.participants")}</h2>
        </div>
        <div className="participants-board__summary ui-chip ui-chip--neutral">
          <strong>
            {voted}/{total}
          </strong>
          <span>{t("room.participant.voted")}</span>
        </div>
      </div>

      <div
        className="participants-board__progress"
        role="progressbar"
        aria-label={t("room.voteProgress")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={voted}
        aria-valuetext={t("room.voteProgressAria", { voted, total })}
      >
        <div className="participants-board__progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="participants-board__presence">
        <div className="presence-row">
          {visibleParticipants.map((participant) => (
            <span
              key={participant.id}
              className={[
                "presence-row__dot",
                participant.connected ? "presence-row__dot--online" : "presence-row__dot--offline",
                participant.hasVoted ? "presence-row__dot--ready" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={participant.name}
              aria-label={`${participant.name}, ${
                participant.connected ? t("connection.connectedFull") : t("room.participant.offline")
              }${participant.hasVoted ? `, ${t("room.participant.voted")}` : ""}`}
            >
              {participant.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {overflowCount > 0 ? (
            <span
              className="presence-row__dot presence-row__dot--overflow"
              title={t("room.participant.moreCount", { count: overflowCount })}
              aria-label={t("room.participant.moreCount", { count: overflowCount })}
            >
              +{overflowCount}
            </span>
          ) : null}
        </div>

        <button
          className="button button--ghost participants-board__toggle"
          onClick={() => setMobileExpanded((expanded) => !expanded)}
          type="button"
          aria-expanded={mobileExpanded}
          aria-controls={rosterId}
        >
          {mobileExpanded ? t("room.hideRoster") : t("room.showRoster", { count: state.participants.length })}
        </button>
      </div>

      <div
        id={rosterId}
        className={[
          "participants-board__grid",
          compact ? "participants-board__grid--compact" : "",
          mobileExpanded ? "participants-board__grid--expanded" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {state.participants.map((participant) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            compact={compact}
            revealed={state.revealed}
            vote={getRevealedVote(state, participant.id)}
          />
        ))}
      </div>
    </section>
  );
}
