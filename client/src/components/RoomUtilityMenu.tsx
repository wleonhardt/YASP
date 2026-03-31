import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { ConnectionStatus } from "../hooks/useSocket";
import { ConnectionBadge, getConnectionLabels } from "./ConnectionBadge";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  status: ConnectionStatus;
};

export function RoomUtilityMenu({ status }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [surfaceStyle, setSurfaceStyle] = useState<CSSProperties>({});
  const panelId = useId();
  const titleId = useId();
  const labels = getConnectionLabels(t, status);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const updateSurfaceStyle = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const isMobile =
        typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches;

      if (isMobile) {
        setSurfaceStyle({});
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 32);
      const left = Math.min(window.innerWidth - width - 16, Math.max(16, rect.right - width));
      setSurfaceStyle({
        top: rect.bottom + 8,
        left,
        width,
      });
    };

    updateSurfaceStyle();
    window.addEventListener("resize", updateSurfaceStyle);
    window.addEventListener("scroll", updateSurfaceStyle, true);

    return () => {
      window.removeEventListener("resize", updateSurfaceStyle);
      window.removeEventListener("scroll", updateSurfaceStyle, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const shouldLockScroll =
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches;
    const previousOverflow = document.body.style.overflow;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (shouldLockScroll) {
        document.body.style.overflow = previousOverflow;
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={["room-utility", open ? "room-utility--open" : ""].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        type="button"
        className={["room-utility__trigger", `room-utility__trigger--${status}`].join(" ")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t("room.openPreferences")} — ${labels.full}`}
        title={t("room.preferences")}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="room-utility__dot" aria-hidden="true" />
        <span className="room-utility__trigger-label room-utility__trigger-label--full" aria-hidden="true">
          {labels.full}
        </span>
        <span className="room-utility__trigger-label room-utility__trigger-label--short" aria-hidden="true">
          {labels.short}
        </span>
        <svg
          className="room-utility__preferences-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="18" r="2" fill="currentColor" stroke="none" />
        </svg>
        <svg
          className={["room-utility__chevron", open ? "room-utility__chevron--open" : ""].join(" ")}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <>
            <button
              type="button"
              className="room-utility__backdrop"
              tabIndex={-1}
              aria-hidden="true"
              onClick={closeMenu}
            />

            <section
              id={panelId}
              className="room-utility__surface"
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              style={surfaceStyle}
            >
              <div className="room-utility__header">
                <h2 id={titleId} className="room-utility__title">
                  {t("room.preferences")}
                </h2>
                <button
                  type="button"
                  className="room-utility__close"
                  aria-label={t("room.close")}
                  onClick={closeMenu}
                >
                  ×
                </button>
              </div>

              <div className="room-utility__section">
                <div className="section-label">{t("room.sessionStatus")}</div>
                <ConnectionBadge status={status} labelMode="full" announce={false} />
                {status !== "connected" && <p className="room-utility__hint">{t("room.reconnectHint")}</p>}
              </div>

              <div className="room-utility__section">
                <div className="section-label">{t("theme.appearance")}</div>
                <ThemeToggle showLabel className="room-utility__theme-toggle" />
              </div>

              <div className="room-utility__section room-utility__section--language">
                <div className="section-label">{t("language.label")}</div>
                <LanguageSwitcher />
              </div>
            </section>
          </>,
          document.body
        )}
    </div>
  );
}
