import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  roomId: string;
  onCopyError: (intent: "success" | "error", message: string) => void;
  copyEnabled?: boolean;
};

export function RoomCodeShare({ roomId, onCopyError, copyEnabled = true }: Props) {
  const { t } = useTranslation();
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
    <div className="room-code-share">
      <div className="topbar__label">{t("room.room")}</div>
      {copyEnabled ? (
        <button
          className={[
            "button",
            "button--ghost",
            "room-code-share__button",
            copied ? "room-code-share__button--copied" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          onClick={handleCopy}
          aria-describedby={feedbackId}
          aria-label={t("room.copyLink")}
        >
          <code className="room-code-share__code">{roomId}</code>
          <span className="room-code-share__divider" aria-hidden="true" />
          <span className="room-code-share__action" aria-hidden="true">
            {copied ? (
              <span className="room-code-share__copied">{t("room.copied")}</span>
            ) : (
              <>
                <span className="room-code-share__copy-label room-code-share__copy-label--full">
                  {t("room.copyLink")}
                </span>
                <span className="room-code-share__copy-label room-code-share__copy-label--short">
                  {t("room.copyShort")}
                </span>
              </>
            )}
          </span>
        </button>
      ) : (
        <div className="room-code-share__button room-code-share__button--static" aria-label={t("room.room")}>
          <code className="room-code-share__code">{roomId}</code>
        </div>
      )}
      <span id={feedbackId} className="sr-only" aria-live="polite" aria-atomic="true">
        {copied ? t("room.copySuccess") : ""}
      </span>
    </div>
  );
}
