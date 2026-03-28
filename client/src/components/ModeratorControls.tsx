import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PublicRoomState } from "@yasp/shared";
import { isMeModerator } from "../lib/room";

type Props = {
  state: PublicRoomState;
  onReveal: () => void;
  onReset: () => void;
  onNextRound: () => void;
  onTransferModerator: (targetParticipantId: string) => Promise<boolean> | boolean;
  disabled?: boolean;
};

export function ModeratorControls({
  state,
  onReveal,
  onReset,
  onNextRound,
  onTransferModerator,
  disabled = false,
}: Props) {
  const isModerator = isMeModerator(state);
  const revealAllowed = !disabled && (state.settings.revealPolicy === "anyone" || isModerator);
  const resetAllowed = !disabled && (state.settings.resetPolicy === "anyone" || isModerator);
  const transferCandidates = useMemo(
    () => state.participants.filter((participant) => participant.id !== state.me.participantId),
    [state.me.participantId, state.participants]
  );
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [targetParticipantId, setTargetParticipantId] = useState(transferCandidates[0]?.id ?? "");
  const transferPanelId = useId();
  const transferSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!transferCandidates.some((participant) => participant.id === targetParticipantId)) {
      setTargetParticipantId(transferCandidates[0]?.id ?? "");
    }
  }, [targetParticipantId, transferCandidates]);

  useEffect(() => {
    if (!isModerator || disabled) {
      setTransferOpen(false);
      setConfirming(false);
    }
  }, [disabled, isModerator]);

  useEffect(() => {
    if (!transferOpen || transferCandidates.length === 0) {
      return;
    }

    transferSelectRef.current?.focus();
  }, [transferCandidates.length, transferOpen]);

  useEffect(() => {
    if (!transferOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirming) {
          setConfirming(false);
        } else {
          setTransferOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirming, transferOpen]);

  const closeTransfer = () => {
    setTransferOpen(false);
    setConfirming(false);
  };

  const handleTransfer = async () => {
    const target = transferCandidates.find((participant) => participant.id === targetParticipantId);
    if (!target) {
      return;
    }

    if (!confirming) {
      setConfirming(true);
      return;
    }

    const transferred = await onTransferModerator(target.id);
    if (transferred) {
      closeTransfer();
    }
  };

  return (
    <section className="app-panel controls-panel">
      <div className="section-header">
        <div>
          <div className="section-label">Actions</div>
          <h2>{state.revealed ? "Next steps" : "Moderator controls"}</h2>
        </div>
        {isModerator && (
          <button
            className="button button--ghost controls-panel__transfer-trigger"
            type="button"
            onClick={() => {
              setTransferOpen((open) => !open);
              setConfirming(false);
            }}
            aria-expanded={transferOpen}
            aria-controls={transferPanelId}
            disabled={disabled}
          >
            Transfer host
          </button>
        )}
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

      {isModerator && transferOpen && (
        <div
          className="controls-panel__transfer-disclosure"
          id={transferPanelId}
          role="group"
          aria-label="Transfer host"
        >
          {transferCandidates.length > 0 ? (
            confirming ? (
              <div className="controls-panel__transfer-confirm">
                <div className="section-label">Confirm transfer</div>
                <p className="controls-panel__hint">
                  Transfer moderator controls to{" "}
                  <strong>{transferCandidates.find((p) => p.id === targetParticipantId)?.name}</strong>? You
                  will lose host privileges.
                </p>
                <div className="controls-panel__transfer-actions">
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => void handleTransfer()}
                    disabled={disabled}
                  >
                    Yes, transfer
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={disabled}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="section-label">Transfer host</div>
                  <p className="controls-panel__hint">
                    Choose the participant who should become the new moderator.
                  </p>
                </div>
                <div className="controls-panel__transfer-row">
                  <label className="field controls-panel__transfer-field">
                    <span className="field__label">New moderator</span>
                    <select
                      ref={transferSelectRef}
                      className="input"
                      value={targetParticipantId}
                      onChange={(event) => setTargetParticipantId(event.target.value)}
                      disabled={disabled}
                    >
                      {transferCandidates.map((participant) => (
                        <option key={participant.id} value={participant.id}>
                          {participant.name}
                          {participant.connected ? "" : " (offline)"}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="controls-panel__transfer-actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => void handleTransfer()}
                      disabled={disabled || !targetParticipantId}
                    >
                      Transfer
                    </button>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={closeTransfer}
                      disabled={disabled}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )
          ) : (
            <>
              <div>
                <div className="section-label">Transfer host</div>
                <p className="controls-panel__hint">Add another participant before transferring host.</p>
              </div>
              <div className="controls-panel__transfer-actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={closeTransfer}
                  disabled={disabled}
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
