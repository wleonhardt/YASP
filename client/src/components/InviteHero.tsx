import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  roomId: string;
  onCopyError: (intent: "success" | "error", message: string) => void;
};

export function InviteHero({ roomId, onCopyError }: Props) {
  const { t } = useTranslation();
  const headingId = useId();
  const feedbackId = useId();
  const resetTimeout = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const roomUrl = `${window.location.origin}/r/${roomId}`;

  useEffect(() => {
    return () => {
      if (resetTimeout.current !== null) {
        window.clearTimeout(resetTimeout.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);

      if (resetTimeout.current !== null) {
        window.clearTimeout(resetTimeout.current);
      }

      resetTimeout.current = window.setTimeout(() => {
        setCopied(false);
        resetTimeout.current = null;
      }, 1800);
    } catch {
      onCopyError("error", t("room.copyError"));
    }
  };

  return (
    <section className="app-panel invite-hero" aria-labelledby={headingId}>
      <div className="invite-hero__copy">
        <h2 id={headingId}>{t("room.inviteHero.title")}</h2>
        <p>{t("room.inviteHero.tagline")}</p>
      </div>

      <code className="invite-hero__code">{roomId}</code>

      <button
        className={[
          "button",
          "button--primary",
          "invite-hero__button",
          copied ? "invite-hero__button--copied" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        type="button"
        onClick={handleCopy}
        aria-describedby={feedbackId}
      >
        {copied ? t("room.copied") : t("room.inviteHero.copyLink")}
      </button>

      <p className="invite-hero__helper">{t("room.inviteHero.helper")}</p>
      <span id={feedbackId} className="sr-only" aria-live="polite" aria-atomic="true">
        {copied ? t("room.copySuccess") : ""}
      </span>
    </section>
  );
}
