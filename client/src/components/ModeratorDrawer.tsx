import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

type Props = {
  children: ReactNode;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  showTrigger?: boolean;
  triggerVariant?: "icon" | "menu";
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModeratorDrawer({
  children,
  disabled = false,
  open,
  onOpenChange,
  returnFocusRef,
  showTrigger = true,
  triggerVariant = "icon",
}: Props) {
  const { t } = useTranslation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const titleId = useId();
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const drawerOpen = open ?? uncontrolledOpen;

  const setDrawerOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open]
  );

  const focusReturnTarget = useCallback(() => {
    (returnFocusRef?.current ?? triggerRef.current)?.focus();
  }, [returnFocusRef]);

  useLayoutEffect(() => {
    if (!drawerOpen) {
      return;
    }

    dialogRef.current?.focus();
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        focusReturnTarget();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen, focusReturnTarget, setDrawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    focusReturnTarget();
  };

  return (
    <>
      {showTrigger ? (
        <button
          ref={triggerRef}
          className={[
            "button",
            "button--ghost",
            "moderator-drawer__trigger",
            `moderator-drawer__trigger--${triggerVariant}`,
          ].join(" ")}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-controls={dialogId}
          title={t("room.moderatorControls")}
          onClick={() => setDrawerOpen(true)}
          disabled={disabled}
        >
          <span className={triggerVariant === "menu" ? "moderator-drawer__trigger-label" : "sr-only"}>
            {t("room.moderatorControls")}
          </span>
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
      ) : null}

      {drawerOpen
        ? createPortal(
            <div className="moderator-drawer">
              <button
                type="button"
                className="moderator-drawer__backdrop"
                tabIndex={-1}
                aria-hidden="true"
                onClick={closeDrawer}
              />
              <section
                ref={dialogRef}
                id={dialogId}
                className="moderator-drawer__surface"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
              >
                <div className="moderator-drawer__header">
                  <h2 id={titleId}>{t("room.moderatorControls")}</h2>
                  <button
                    type="button"
                    className="button button--ghost moderator-drawer__close"
                    onClick={closeDrawer}
                    aria-label={t("room.close")}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="moderator-drawer__body">{children}</div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
