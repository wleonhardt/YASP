import type { ReactNode, RefObject } from "react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeckType } from "@yasp/shared";
import type { DeckInput } from "@yasp/shared";
import { createDeckTextSet } from "../i18n/decks";
import { DeckToken } from "./DeckToken";
import {
  buildDeckInput,
  buildDeckPreview,
  createDefaultDeckDraft,
  FIBONACCI_MAX_OPTIONS,
  MODIFIED_FIBONACCI_MAX_OPTIONS,
  POWERS_OF_TWO_MAX_OPTIONS,
  TSHIRT_SIZES,
  type DeckDraft,
  type DeckCustomizeMode,
  type TShirtSize,
} from "../lib/deckGenerators";
import { getNextRovingValue } from "../lib/rovingFocus";

type Props = {
  open: boolean;
  baseDeckType: Exclude<DeckType, "custom">;
  onClose(): void;
  onApply(deckInput: DeckInput): void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

type DeckTab = "simple" | "advanced" | "custom";

const TAB_OPTIONS: readonly DeckTab[] = ["simple", "advanced", "custom"];

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function resolveReturnFocusTarget(
  returnFocusRef: RefObject<HTMLElement | null> | undefined,
  previousActive: HTMLElement | null
) {
  if (returnFocusRef?.current && returnFocusRef.current.isConnected) {
    return returnFocusRef.current;
  }

  if (previousActive?.isConnected) {
    return previousActive;
  }

  return null;
}

export function DeckCustomizeModal({ open, baseDeckType, onClose, onApply, returnFocusRef }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DeckTab>("simple");
  const [draft, setDraft] = useState<DeckDraft>(() => createDefaultDeckDraft(baseDeckType));
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Record<DeckTab, HTMLButtonElement | null>>({
    simple: null,
    advanced: null,
    custom: null,
  });
  const titleId = useId();
  const subtitleId = useId();
  const customCardsInputId = useId();
  const simpleTabId = useId();
  const advancedTabId = useId();
  const customTabId = useId();
  const simplePanelId = useId();
  const advancedPanelId = useId();
  const customPanelId = useId();
  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab("simple");
    setDraft(createDefaultDeckDraft(baseDeckType));
  }, [baseDeckType, open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled")
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

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

      window.requestAnimationFrame(() => {
        resolveReturnFocusTarget(returnFocusRef, previousActive)?.focus();
      });
    };
  }, [onClose, open, returnFocusRef]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (modalRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [onClose, open]);

  const mode: DeckCustomizeMode = activeTab === "custom" ? "custom" : "preset";
  const deckTextSet = useMemo(() => createDeckTextSet(t), [t]);
  const preview = useMemo(() => buildDeckPreview(draft, mode, deckTextSet), [deckTextSet, draft, mode]);
  const defaultPreview = useMemo(
    () => buildDeckPreview(createDefaultDeckDraft(baseDeckType), "preset", deckTextSet),
    [baseDeckType, deckTextSet]
  );
  const subtitle =
    mode === "preset" && arraysEqual(preview.cards, defaultPreview.cards)
      ? t("deck.preview.default", { label: preview.label })
      : preview.label;

  if (!open) {
    return null;
  }

  const canApply = preview.errors.length === 0 && preview.cards.length > 0;

  const updateDraft = (next: Partial<DeckDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
  };

  const handleApply = () => {
    if (!canApply) {
      return;
    }

    onApply(buildDeckInput(draft, mode, deckTextSet));
  };

  const handleReset = () => {
    setActiveTab("simple");
    setDraft(createDefaultDeckDraft(baseDeckType));
  };

  const zeroToggleDisabled = draft.baseDeckType === "tshirt";
  const halfToggleDisabled = draft.baseDeckType !== "modified_fibonacci";
  const tabIds: Record<DeckTab, string> = {
    simple: simpleTabId,
    advanced: advancedTabId,
    custom: customTabId,
  };
  const panelIds: Record<DeckTab, string> = {
    simple: simplePanelId,
    advanced: advancedPanelId,
    custom: customPanelId,
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: DeckTab) => {
    const nextTab = getNextRovingValue(TAB_OPTIONS, currentTab, event.key);

    if (!nextTab) {
      return;
    }

    event.preventDefault();
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={modalRef}
        className="deck-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
      >
        <div className="deck-modal__header">
          <div className="deck-modal__title-group">
            <h2 id={titleId}>{t("deck.modal.title")}</h2>
            <p id={subtitleId} className="deck-modal__subtitle">
              {subtitle}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            className="deck-modal__close"
            type="button"
            aria-label={t("deck.modal.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="segmented deck-modal__tabs" role="tablist" aria-label={t("deck.modal.tabList")}>
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab}
              ref={(element) => {
                tabRefs.current[tab] = element;
              }}
              id={tabIds[tab]}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={panelIds[tab]}
              tabIndex={activeTab === tab ? 0 : -1}
              className={[
                "segmented__option",
                "deck-modal__tab",
                activeTab === tab ? "segmented__option--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, tab)}
            >
              <span>{t(`deck.modal.tabs.${tab}`)}</span>
            </button>
          ))}
        </div>

        <div className="deck-modal__body">
          {activeTab === "simple" && (
            <div
              className="deck-modal__panel"
              role="tabpanel"
              id={simplePanelId}
              aria-labelledby={simpleTabId}
              tabIndex={0}
            >
              <SimpleDeckControls draft={draft} onChange={updateDraft} />
            </div>
          )}

          {activeTab === "advanced" && (
            <div
              className="deck-modal__panel"
              role="tabpanel"
              id={advancedPanelId}
              aria-labelledby={advancedTabId}
              tabIndex={0}
            >
              <div className="deck-modal__control-group">
                <div className="section-label">{t("deck.modal.advancedOptions")}</div>

                <ToggleField
                  label={t("deck.modal.includeQuestion")}
                  description={t("deck.modal.questionDescription")}
                  checked={draft.includeQuestionMark}
                  onChange={(checked) => updateDraft({ includeQuestionMark: checked })}
                />

                <ToggleField
                  label={t("deck.modal.includeCoffee")}
                  description={t("deck.modal.coffeeDescription")}
                  checked={draft.includeCoffee}
                  onChange={(checked) => updateDraft({ includeCoffee: checked })}
                />

                <ToggleField
                  label={t("deck.modal.includeZero")}
                  description={
                    zeroToggleDisabled ? t("deck.modal.zeroNotUsed") : t("deck.modal.zeroNumericOnly")
                  }
                  checked={draft.includeZero}
                  disabled={zeroToggleDisabled}
                  onChange={(checked) => updateDraft({ includeZero: checked })}
                />

                <ToggleField
                  label={t("deck.modal.includeHalf")}
                  description={
                    halfToggleDisabled ? t("deck.modal.halfUnavailable") : t("deck.modal.halfDefault")
                  }
                  checked={draft.includeHalf}
                  disabled={halfToggleDisabled}
                  onChange={(checked) => updateDraft({ includeHalf: checked })}
                />
              </div>
            </div>
          )}

          {activeTab === "custom" && (
            <div
              className="deck-modal__panel"
              role="tabpanel"
              id={customPanelId}
              aria-labelledby={customTabId}
              tabIndex={0}
            >
              <label className="field" htmlFor={customCardsInputId}>
                <span className="field__label">{t("deck.modal.cardsLabel")}</span>
                <textarea
                  id={customCardsInputId}
                  className="input deck-modal__textarea"
                  value={draft.customInputText}
                  onChange={(event) => updateDraft({ customInputText: event.target.value })}
                  placeholder={t("deck.modal.cardsPlaceholder")}
                />
              </label>

              <div className="deck-modal__toggle-grid">
                <ToggleField
                  label={t("deck.modal.includeQuestion")}
                  description={t("deck.modal.questionDescription")}
                  checked={draft.includeQuestionMark}
                  onChange={(checked) => updateDraft({ includeQuestionMark: checked })}
                />

                <ToggleField
                  label={t("deck.modal.includeCoffee")}
                  description={t("deck.modal.coffeeDescription")}
                  checked={draft.includeCoffee}
                  onChange={(checked) => updateDraft({ includeCoffee: checked })}
                />
              </div>
            </div>
          )}

          <section className="deck-modal__preview">
            <div className="deck-modal__preview-header">
              <div className="section-label">{t("deck.modal.preview")}</div>
              <div className="deck-modal__preview-label">{preview.label}</div>
            </div>

            <DeckPreviewChips cards={preview.cards} />

            {preview.errors.length > 0 && (
              <div className="deck-modal__messages">
                {preview.errors.map((error) => (
                  <p key={error} className="deck-modal__message deck-modal__message--error">
                    {error}
                  </p>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="deck-modal__footer">
          <button className="deck-modal__text-button" type="button" onClick={handleReset}>
            {t("deck.modal.reset")}
          </button>

          <div className="deck-modal__footer-actions">
            <button className="button button--secondary" type="button" onClick={onClose}>
              {t("deck.modal.cancel")}
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={handleApply}
              disabled={!canApply}
            >
              {t("deck.modal.useDeck")}
            </button>
          </div>
        </div>

        <p className="deck-modal__footer-note">{t("deck.modal.footerNote")}</p>
      </div>
    </div>
  );
}

function SimpleDeckControls({
  draft,
  onChange,
}: {
  draft: DeckDraft;
  onChange(next: Partial<DeckDraft>): void;
}) {
  const { t } = useTranslation();

  switch (draft.baseDeckType) {
    case "fibonacci":
      return (
        <OptionSlider
          label={t("deck.modal.maxValue")}
          value={draft.fibonacciMax}
          options={FIBONACCI_MAX_OPTIONS}
          onChange={(value) => onChange({ fibonacciMax: value })}
        />
      );
    case "modified_fibonacci":
      return (
        <OptionSlider
          label={t("deck.modal.maxValue")}
          value={draft.modifiedMax}
          options={MODIFIED_FIBONACCI_MAX_OPTIONS}
          onChange={(value) => onChange({ modifiedMax: value })}
        />
      );
    case "powers_of_two":
      return (
        <OptionSlider
          label={t("deck.modal.maxValue")}
          value={draft.powersMax}
          options={POWERS_OF_TWO_MAX_OPTIONS}
          onChange={(value) => onChange({ powersMax: value })}
        />
      );
    case "tshirt":
      return (
        <div className="deck-modal__range-grid">
          <label className="field">
            <span className="field__label">{t("deck.modal.minimumSize")}</span>
            <select
              className="input"
              value={draft.tshirtMin}
              onChange={(event) => onChange({ tshirtMin: event.target.value as TShirtSize })}
            >
              {TSHIRT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">{t("deck.modal.maximumSize")}</span>
            <select
              className="input"
              value={draft.tshirtMax}
              onChange={(event) => onChange({ tshirtMax: event.target.value as TShirtSize })}
            >
              {TSHIRT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
  }
}

function OptionSlider({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly number[];
  onChange(value: number): void;
}) {
  const inputId = useId();
  const currentIndex = Math.max(0, options.indexOf(value));

  return (
    <div className="deck-modal__control-group">
      <div className="deck-modal__slider-header">
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
        <strong>{options[currentIndex]}</strong>
      </div>

      <input
        id={inputId}
        className="slider"
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={currentIndex}
        onChange={(event) => onChange(options[Number(event.target.value)] ?? options[0])}
      />

      <div className="deck-modal__slider-labels" aria-hidden="true">
        {options.map((option) => (
          <span key={option} className={option === value ? "deck-modal__slider-label--active" : ""}>
            {option}
          </span>
        ))}
      </div>
    </div>
  );
}

function ToggleField({
  label,
  description,
  checked,
  disabled = false,
  onChange,
  accessibleLabel,
}: {
  label: ReactNode;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  accessibleLabel?: string;
}) {
  const inputId = useId();
  const labelId = useId();
  const descriptionId = useId();

  return (
    <label
      className={["deck-modal__toggle", disabled ? "deck-modal__toggle--disabled" : ""]
        .filter(Boolean)
        .join(" ")}
      htmlFor={inputId}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        aria-label={accessibleLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="deck-modal__toggle-copy">
        <strong id={labelId}>{label}</strong>
        <small id={descriptionId}>{description}</small>
      </span>
    </label>
  );
}

function DeckPreviewChips({ cards }: { cards: string[] }) {
  const { t } = useTranslation();

  if (cards.length === 0) {
    return <p className="deck-modal__empty-preview">{t("deck.modal.cardsAppear")}</p>;
  }

  return (
    <div className="deck-chip-row">
      {cards.map((card, index) => (
        <span key={`${card}-${index}`} className="deck-chip">
          <DeckToken token={card} />
        </span>
      ))}
    </div>
  );
}
