import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { isMeModerator } from "../lib/room";

type Props = {
  state: PublicRoomState;
  onReveal: () => void;
  onReset: () => void;
  onNextRound: () => void;
  disabled?: boolean;
};

export function RoundActionBar({ state, onReveal, onReset, onNextRound, disabled = false }: Props) {
  const { t } = useTranslation();
  const hintId = useId();
  const isModerator = isMeModerator(state);
  const revealAllowed = !disabled && (state.settings.revealPolicy === "anyone" || isModerator);
  const resetAllowed = !disabled && (state.settings.resetPolicy === "anyone" || isModerator);
  const actionHint =
    !isModerator &&
    ((state.revealed && state.settings.resetPolicy === "moderator_only") ||
      (!state.revealed && state.settings.revealPolicy === "moderator_only"))
      ? state.revealed
        ? t("room.onlyModeratorAdvanceReset")
        : t("room.onlyModeratorReveal")
      : null;

  const primaryDisabled = state.revealed ? !resetAllowed : !revealAllowed;

  return (
    <section className="round-action-bar" aria-label={t("room.nextStep")}>
      <div className="round-action-bar__copy">
        <div className="section-label">{t("room.nextStep")}</div>
        <p>{state.revealed ? t("room.phase.revealed") : t("room.phase.voting")}</p>
      </div>

      {/* Invariant: the current round phase has exactly one primary CTA, and it lives in this stage bar. */}
      <div className="round-action-bar__actions">
        {state.revealed ? (
          <>
            <button
              className="button button--ghost round-action-bar__secondary"
              type="button"
              onClick={onReset}
              disabled={!resetAllowed || disabled}
              aria-describedby={!resetAllowed && actionHint ? hintId : undefined}
            >
              {t("room.resetRound")}
            </button>
            <button
              className="button button--primary round-action-bar__primary"
              type="button"
              onClick={onNextRound}
              disabled={primaryDisabled}
              aria-describedby={primaryDisabled && actionHint ? hintId : undefined}
            >
              {t("room.nextRound")}
            </button>
          </>
        ) : (
          <button
            className="button button--primary round-action-bar__primary"
            type="button"
            onClick={onReveal}
            disabled={primaryDisabled}
            aria-describedby={primaryDisabled && actionHint ? hintId : undefined}
          >
            {t("room.revealVotes")}
          </button>
        )}
      </div>

      {actionHint ? (
        <p className="round-action-bar__hint" id={hintId}>
          {actionHint}
        </p>
      ) : null}
    </section>
  );
}
