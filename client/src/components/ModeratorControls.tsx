import type { PublicRoomState } from "@yasp/shared";
import { isMeModerator } from "../lib/room";

type Props = {
  state: PublicRoomState;
  onReveal: () => void;
  onReset: () => void;
  onNextRound: () => void;
  disabled?: boolean;
};

export function ModeratorControls({
  state,
  onReveal,
  onReset,
  onNextRound,
  disabled = false,
}: Props) {
  const isModerator = isMeModerator(state);
  const revealAllowed =
    !disabled && (state.settings.revealPolicy === "anyone" || isModerator);
  const resetAllowed =
    !disabled && (state.settings.resetPolicy === "anyone" || isModerator);

  return (
    <section className="app-panel controls-panel">
      <div className="section-header">
        <div>
          <div className="section-label">Actions</div>
          <h2>{state.revealed ? "Next steps" : "Moderator controls"}</h2>
        </div>
      </div>

      <div className="controls-panel__buttons">
        {!state.revealed ? (
          <button
            className="button button--primary button--full"
            onClick={onReveal}
            disabled={!revealAllowed}
            title={!revealAllowed ? "Only the moderator can reveal" : undefined}
          >
            Reveal votes
          </button>
        ) : (
          <>
            <button
              className="button button--primary button--full"
              onClick={onNextRound}
              disabled={!resetAllowed}
              title={!resetAllowed ? "Only the moderator can advance the round" : undefined}
            >
              Next round
            </button>
            <button
              className="button button--secondary button--full"
              onClick={onReset}
              disabled={!resetAllowed}
              title={!resetAllowed ? "Only the moderator can reset" : undefined}
            >
              Reset
            </button>
          </>
        )}
      </div>

      {!isModerator &&
        ((state.revealed && state.settings.resetPolicy === "moderator_only") ||
          (!state.revealed && state.settings.revealPolicy === "moderator_only")) && (
          <p className="controls-panel__hint">
            Only the moderator can {state.revealed ? "advance or reset" : "reveal"} this round.
          </p>
        )}
    </section>
  );
}
