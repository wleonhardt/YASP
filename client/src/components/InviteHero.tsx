import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  roomId: string;
  compact?: boolean;
  onCopyError: (intent: "success" | "error", message: string) => void;
};

export function InviteHero({ roomId, compact = false, onCopyError }: Props) {
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
    <section
      className={["app-panel", "invite-hero", compact ? "invite-hero--compact" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={headingId}
    >
      <div className="invite-hero__copy">
        <h2 id={headingId}>{compact ? t("room.inviteHero.compactTitle") : t("room.inviteHero.title")}</h2>
        {!compact ? <p>{t("room.inviteHero.tagline")}</p> : null}
      </div>

      {!compact ? <code className="invite-hero__code">{roomId}</code> : null}

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

      {!compact ? <p className="invite-hero__helper">{t("room.inviteHero.helper")}</p> : null}
      <span id={feedbackId} className="sr-only" aria-live="polite" aria-atomic="true">
        {copied ? t("room.copySuccess") : ""}
      </span>
    </section>
  );
}
