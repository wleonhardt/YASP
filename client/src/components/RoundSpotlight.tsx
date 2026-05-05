import { useTranslation } from "react-i18next";
import type { OutlierCallout } from "../lib/room";
import { DeckToken } from "./DeckToken";

type Props = {
  callout: OutlierCallout;
};

export function RoundSpotlight({ callout }: Props) {
  const { t } = useTranslation();

  return (
    <details className="round-spotlight">
      <summary className="round-spotlight__summary">
        <span className="round-spotlight__eyebrow">{t("room.spotlight.outlier.eyebrow")}</span>
        <span className="round-spotlight__title">{t("room.spotlight.outlier.title")}</span>
        <span className="round-spotlight__action">{t("room.spotlight.outlier.details")}</span>
      </summary>
      <div className="round-spotlight__body">
        <p>{t("room.spotlight.outlier.mode", { vote: callout.modeVote })}</p>
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
