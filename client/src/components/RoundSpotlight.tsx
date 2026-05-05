import { useTranslation } from "react-i18next";
import type { RoundSpotlightCallout } from "../lib/room";
import { DeckToken } from "./DeckToken";

type Props = {
  callout: RoundSpotlightCallout;
};

export function RoundSpotlight({ callout }: Props) {
  const { t } = useTranslation();
  const translationKey =
    callout.kind === "almostConsensus" ? "room.spotlight.almostConsensus" : "room.spotlight.outlier";

  return (
    <details className="round-spotlight">
      <summary className="round-spotlight__summary">
        <span className="round-spotlight__eyebrow">{t(`${translationKey}.eyebrow`)}</span>
        <span className="round-spotlight__title">{t(`${translationKey}.title`)}</span>
        <span className="round-spotlight__action">{t(`${translationKey}.details`)}</span>
      </summary>
      <div className="round-spotlight__body">
        <p>{t(`${translationKey}.mode`, { vote: callout.modeVote })}</p>
        <ul className="round-spotlight__list">
          {callout.outliers.map(({ participant, vote }) => (
            <li key={participant.id} className="round-spotlight__item">
              <span>{participant.name}</span>
              <DeckToken token={vote} />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
