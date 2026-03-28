import { useEffect, useState } from "react";
import type { PublicRoomState } from "@yasp/shared";
import { ParticipantCard } from "./ParticipantCard";
import { getConnectedVoterCounts, getRevealedVote } from "../lib/room";

type Props = {
  state: PublicRoomState;
};

export function ParticipantsBoard({ state }: Props) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false
  );
  const [mobileExpanded, setMobileExpanded] = useState(() =>
    typeof window !== "undefined" ? !window.matchMedia("(max-width: 720px)").matches : true
  );
  const { voted, total, percent } = getConnectedVoterCounts(state);
  const compact = state.participants.length > 12 || isMobile;

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
    <section className="app-panel participants-board">
      <div className="section-header">
        <div>
          <div className="section-label">Live board</div>
          <h2>Participants</h2>
        </div>
        <div className="participants-board__summary">
          <strong>
            {voted}/{total}
          </strong>
          <span>voted</span>
        </div>
      </div>

      <div className="participants-board__progress">
        <div className="participants-board__progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="participants-board__presence">
        <div className="presence-row">
          {state.participants.slice(0, 8).map((participant) => (
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
            >
              {participant.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>

        <button
          className="button button--ghost participants-board__toggle"
          onClick={() => setMobileExpanded((expanded) => !expanded)}
          type="button"
          aria-expanded={mobileExpanded}
        >
          {mobileExpanded ? "Hide roster" : `Show roster (${state.participants.length})`}
        </button>
      </div>

      <div
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
