import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DeckType } from "@yasp/shared";
import type { DeckInput } from "@yasp/shared";
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

type Props = {
  open: boolean;
  baseDeckType: Exclude<DeckType, "custom">;
  onClose(): void;
  onApply(deckInput: DeckInput): void;
};

type DeckTab = "simple" | "advanced" | "custom";

const TAB_OPTIONS: Array<{ value: DeckTab; label: string }> = [
  { value: "simple", label: "Simple" },
  { value: "advanced", label: "Advanced" },
  { value: "custom", label: "Custom" },
];

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

export function DeckCustomizeModal({ open, baseDeckType, onClose, onApply }: Props) {
  const [activeTab, setActiveTab] = useState<DeckTab>("simple");
  const [draft, setDraft] = useState<DeckDraft>(() => createDefaultDeckDraft(baseDeckType));
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();
  const customCardsInputId = useId();

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

    const previousActive = document.activeElement as HTMLElement | null;
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
      previousActive?.focus();
    };
  }, [onClose, open]);

  const mode: DeckCustomizeMode = activeTab === "custom" ? "custom" : "preset";
  const preview = useMemo(() => buildDeckPreview(draft, mode), [draft, mode]);
  const defaultPreview = useMemo(
    () => buildDeckPreview(createDefaultDeckDraft(baseDeckType), "preset"),
    [baseDeckType]
  );
  const subtitle =
    mode === "preset" && arraysEqual(preview.cards, defaultPreview.cards)
      ? `${preview.label} (default)`
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

    onApply(buildDeckInput(draft, mode));
  };

  const handleReset = () => {
    setActiveTab("simple");
    setDraft(createDefaultDeckDraft(baseDeckType));
  };

  const zeroToggleDisabled = draft.baseDeckType === "tshirt";
  const halfToggleDisabled = draft.baseDeckType !== "modified_fibonacci";

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
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
            <h2 id={titleId}>Customize deck</h2>
            <p id={subtitleId} className="deck-modal__subtitle">
              {subtitle}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            className="deck-modal__close"
            type="button"
            aria-label="Close deck customization"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="segmented deck-modal__tabs" role="tablist" aria-label="Deck customization tabs">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              className={[
                "segmented__option",
                "deck-modal__tab",
                activeTab === tab.value ? "segmented__option--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveTab(tab.value)}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="deck-modal__body">
          {activeTab === "simple" && (
            <div className="deck-modal__panel">
              <SimpleDeckControls draft={draft} onChange={updateDraft} />
            </div>
          )}

          {activeTab === "advanced" && (
            <div className="deck-modal__panel">
              <div className="deck-modal__control-group">
                <div className="section-label">Advanced options</div>

                <ToggleField
                  label='Include "?"'
                  description="Keep the uncertainty card available."
                  checked={draft.includeQuestionMark}
                  onChange={(checked) => updateDraft({ includeQuestionMark: checked })}
                />

                <ToggleField
                  label='Include "☕"'
                  description="Add a coffee-break card near the end."
                  checked={draft.includeCoffee}
                  onChange={(checked) => updateDraft({ includeCoffee: checked })}
                />

                <ToggleField
                  label='Include "0"'
                  description={
                    zeroToggleDisabled
                      ? "Not used for T-Shirt decks."
                      : "Only affects generated numeric decks."
                  }
                  checked={draft.includeZero}
                  disabled={zeroToggleDisabled}
                  onChange={(checked) => updateDraft({ includeZero: checked })}
                />

                <ToggleField
                  label='Include "0.5"'
                  description={
                    halfToggleDisabled
                      ? "Only available for Modified Fibonacci."
                      : "Matches the default Modified Fibonacci deck."
                  }
                  checked={draft.includeHalf}
                  disabled={halfToggleDisabled}
                  onChange={(checked) => updateDraft({ includeHalf: checked })}
                />
              </div>
            </div>
          )}

          {activeTab === "custom" && (
            <div className="deck-modal__panel">
              <label className="field" htmlFor={customCardsInputId}>
                <span className="field__label">Cards</span>
                <textarea
                  id={customCardsInputId}
                  className="input deck-modal__textarea"
                  value={draft.customInputText}
                  onChange={(event) => updateDraft({ customInputText: event.target.value })}
                  placeholder="Enter cards separated by commas or spaces, e.g. 1, 2, 3, 5, 8"
                />
              </label>

              <div className="deck-modal__toggle-grid">
                <ToggleField
                  label='Include "?"'
                  description="Keep the uncertainty card available."
                  checked={draft.includeQuestionMark}
                  onChange={(checked) => updateDraft({ includeQuestionMark: checked })}
                />

                <ToggleField
                  label='Include "☕"'
                  description="Add a coffee-break card near the end."
                  checked={draft.includeCoffee}
                  onChange={(checked) => updateDraft({ includeCoffee: checked })}
                />
              </div>
            </div>
          )}

          <section className="deck-modal__preview">
            <div className="deck-modal__preview-header">
              <div className="section-label">Preview</div>
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
            Reset to defaults
          </button>

          <div className="deck-modal__footer-actions">
            <button className="button button--secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={handleApply}
              disabled={!canApply}
            >
              Use deck
            </button>
          </div>
        </div>

        <p className="deck-modal__footer-note">Will create a Custom deck for this room.</p>
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
  switch (draft.baseDeckType) {
    case "fibonacci":
      return (
        <OptionSlider
          label="Max value"
          value={draft.fibonacciMax}
          options={FIBONACCI_MAX_OPTIONS}
          onChange={(value) => onChange({ fibonacciMax: value })}
        />
      );
    case "modified_fibonacci":
      return (
        <OptionSlider
          label="Max value"
          value={draft.modifiedMax}
          options={MODIFIED_FIBONACCI_MAX_OPTIONS}
          onChange={(value) => onChange({ modifiedMax: value })}
        />
      );
    case "powers_of_two":
      return (
        <OptionSlider
          label="Max value"
          value={draft.powersMax}
          options={POWERS_OF_TWO_MAX_OPTIONS}
          onChange={(value) => onChange({ powersMax: value })}
        />
      );
    case "tshirt":
      return (
        <div className="deck-modal__range-grid">
          <label className="field">
            <span className="field__label">Minimum size</span>
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
            <span className="field__label">Maximum size</span>
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
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label
      className={["deck-modal__toggle", disabled ? "deck-modal__toggle--disabled" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="deck-modal__toggle-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

function DeckPreviewChips({ cards }: { cards: string[] }) {
  if (cards.length === 0) {
    return <p className="deck-modal__empty-preview">Cards will appear here.</p>;
  }

  return (
    <div className="deck-chip-row">
      {cards.map((card, index) => (
        <span key={`${card}-${index}`} className="deck-chip">
          {card}
        </span>
      ))}
    </div>
  );
}
