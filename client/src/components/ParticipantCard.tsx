import type { PublicParticipant } from "@yasp/shared";
import { useTranslation } from "react-i18next";
import { DeckToken } from "./DeckToken";
import { getParticipantInitials } from "../lib/room";

type Props = {
  participant: PublicParticipant;
  revealed: boolean;
  vote?: string;
  compact?: boolean;
};

export function ParticipantCard({ participant, revealed, vote, compact = false }: Props) {
  const { t } = useTranslation();
  const statusTone = !participant.connected ? "danger" : participant.hasVoted ? "success" : "neutral";
  const statusLabel = !participant.connected
    ? t("room.participant.offline")
    : participant.hasVoted
      ? t("room.participant.voted")
      : t("room.participant.notVoted");

  return (
    <article
      className={[
        "participant-card",
        compact ? "participant-card--compact" : "",
        participant.isSelf ? "participant-card--self" : "",
        revealed ? "participant-card--revealed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="participant-card__head">
        <div className="participant-card__identity">
          <div className="participant-card__avatar">{getParticipantInitials(participant.name)}</div>
          <div className="participant-card__copy">
            <div className="participant-card__name-row">
              <span className="participant-card__name">{participant.name}</span>
              {participant.isSelf && (
                <span className="ui-chip ui-chip--self">{t("room.participant.you")}</span>
              )}
            </div>
            <div className="participant-card__meta">
              {participant.role === "spectator" && (
                <span className="ui-chip ui-chip--neutral">{t("room.participant.spectator")}</span>
              )}
              <span className={`ui-chip ui-chip--${statusTone}`}>{statusLabel}</span>
            </div>
          </div>
        </div>
        {participant.isModerator && (
          <span className="participant-card__moderator" title={t("room.participant.moderator")}>
            ✦
          </span>
        )}
      </div>

      <div
        className={[
          "participant-card__vote",
          revealed ? "participant-card__vote--revealed" : "",
          participant.hasVoted ? "participant-card__vote--ready" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {revealed ? (
          vote ? (
            <DeckToken token={vote} variant="card" />
          ) : (
            "—"
          )
        ) : participant.hasVoted ? (
          t("room.participant.ready")
        ) : (
          "…"
        )}
      </div>
    </article>
  );
}
