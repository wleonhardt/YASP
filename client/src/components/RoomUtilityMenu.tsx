import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { primeRoomAudio } from "../lib/audio";
import type { ConnectionStatus } from "../lib/connectionRecovery";
import { useTimerSoundPreference } from "../hooks/useTimerSoundPreference";
import { ConnectionBadge, getConnectionLabels } from "./ConnectionBadge";
import { ModeratorDrawer } from "./ModeratorDrawer";
import { SoundIcon } from "./icons/SoundIcon";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  status: ConnectionStatus;
  compatibilityMode?: boolean;
  moderatorControls?: ReactNode;
  moderatorControlsDisabled?: boolean;
};

export function RoomUtilityMenu({
  status,
  compatibilityMode = false,
  moderatorControls = null,
  moderatorControlsDisabled = false,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [moderatorDrawerOpen, setModeratorDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const [surfaceStyle, setSurfaceStyle] = useState<CSSProperties>({});
  const [compactViewport, setCompactViewport] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 720px)").matches
      : false
  );
  const panelId = useId();
  const titleId = useId();
  const labels = getConnectionLabels(t, status);
  const [timerSoundEnabled, setTimerSoundEnabled] = useTimerSoundPreference();

  useEffect(() => {
    if (!moderatorControls) {
      setModeratorDrawerOpen(false);
    }
  }, [moderatorControls]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const syncViewport = () => setCompactViewport(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const updateSurfaceStyle = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      if (compactViewport) {
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
  }, [compactViewport, open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    surfaceRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const shouldLockScroll = compactViewport;
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
  }, [compactViewport, open]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openModeratorDrawer = () => {
    setOpen(false);
    setModeratorDrawerOpen(true);
  };

  const handleToggleTimerSound = async () => {
    if (!timerSoundEnabled) {
      await primeRoomAudio();
      setTimerSoundEnabled(true);
      return;
    }

    setTimerSoundEnabled(false);
  };

  return (
    <div className={["room-utility", open ? "room-utility--open" : ""].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        type="button"
        className={[
          "room-utility__trigger",
          `room-utility__trigger--${status}`,
          compatibilityMode ? "room-utility__trigger--compatibility" : "",
        ].join(" ")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t("room.openPreferences")} — ${compactViewport ? labels.short : labels.full}`}
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
        {compatibilityMode && (
          <span className="room-utility__mode" aria-label={t("connection.compatibilityModeActive")}>
            {t("connection.compatibilityShort")}
          </span>
        )}
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
              ref={surfaceRef}
              id={panelId}
              className="room-utility__surface"
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              tabIndex={-1}
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
                <ConnectionBadge
                  status={status}
                  labelMode="full"
                  announce={false}
                  compatibilityMode={compatibilityMode}
                />
                {compatibilityMode && (
                  <p className="room-utility__hint">{t("connection.compatibilityModeActive")}</p>
                )}
              </div>

              <div className="room-utility__section">
                <div className="section-label">{t("theme.appearance")}</div>
                <ThemeToggle showLabel className="room-utility__theme-toggle" />
              </div>

              {moderatorControls ? (
                <div className="room-utility__section">
                  <div className="section-label">{t("room.moderatorControls")}</div>
                  <button
                    type="button"
                    className="button button--ghost moderator-drawer__trigger moderator-drawer__trigger--menu"
                    aria-haspopup="dialog"
                    onClick={openModeratorDrawer}
                    disabled={moderatorControlsDisabled}
                  >
                    <span className="moderator-drawer__trigger-label">{t("room.moderatorControls")}</span>
                    <svg
                      className="moderator-drawer__trigger-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="21" y1="4" x2="14" y2="4" />
                      <line x1="10" y1="4" x2="3" y2="4" />
                      <line x1="21" y1="12" x2="12" y2="12" />
                      <line x1="8" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="20" x2="16" y2="20" />
                      <line x1="12" y1="20" x2="3" y2="20" />
                      <line x1="14" y1="2" x2="14" y2="6" />
                      <line x1="8" y1="10" x2="8" y2="14" />
                      <line x1="16" y1="18" x2="16" y2="22" />
                    </svg>
                  </button>
                </div>
              ) : null}

              <div className="room-utility__section">
                <div className="section-label">{t("room.timer")}</div>
                <button
                  type="button"
                  className={[
                    "button",
                    timerSoundEnabled ? "button--secondary" : "button--ghost",
                    "room-utility__sound-toggle",
                  ].join(" ")}
                  aria-pressed={timerSoundEnabled}
                  onClick={() => void handleToggleTimerSound()}
                >
                  <span className="room-utility__sound-icon" aria-hidden="true">
                    <SoundIcon enabled={timerSoundEnabled} />
                  </span>
                  <span>{timerSoundEnabled ? t("room.timerSoundOn") : t("room.timerSoundOff")}</span>
                </button>
              </div>

              <div className="room-utility__section room-utility__section--language">
                <div className="section-label">{t("language.label")}</div>
                <LanguageSwitcher />
              </div>
            </section>
          </>,
          document.body
        )}
      {moderatorControls ? (
        <ModeratorDrawer
          open={moderatorDrawerOpen}
          onOpenChange={setModeratorDrawerOpen}
          returnFocusRef={triggerRef}
          showTrigger={false}
        >
          {moderatorControls}
        </ModeratorDrawer>
      ) : null}
    </div>
  );
}
