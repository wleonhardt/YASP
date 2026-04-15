import { useEffect, useId, useRef, useState } from "react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionPolicy, PublicRoomState, RoomSettings } from "@yasp/shared";
import { isMeModerator } from "../lib/room";

type Props = {
  state: PublicRoomState;
  onUpdateSettings: (settings: Partial<RoomSettings>) => Promise<boolean> | boolean;
  disabled?: boolean;
};

type PolicySettingProps = {
  label: string;
  description: string;
  value: PermissionPolicy;
  onChange: (value: PermissionPolicy) => void;
  disabled?: boolean;
  inputRef?: Ref<HTMLSelectElement>;
};

type ToggleSettingProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={[
        "controls-panel__disclosure-chevron",
        open ? "controls-panel__disclosure-chevron--open" : "",
      ].join(" ")}
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
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PolicySetting({
  label,
  description,
  value,
  onChange,
  disabled = false,
  inputRef,
}: PolicySettingProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const helpId = useId();

  return (
    <label className="field controls-panel__settings-field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <select
        ref={inputRef}
        id={inputId}
        className="input"
        value={value}
        aria-describedby={helpId}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as PermissionPolicy)}
      >
        <option value="moderator_only">{t("room.policyLabel.moderatorOnly")}</option>
        <option value="anyone">{t("room.policyLabel.anyone")}</option>
      </select>
      <small className="controls-panel__settings-help" id={helpId}>
        {description}
      </small>
    </label>
  );
}

function ToggleSetting({ label, description, checked, onChange, disabled = false }: ToggleSettingProps) {
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
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="deck-modal__toggle-copy">
        <strong id={labelId}>{label}</strong>
        <small id={descriptionId}>{description}</small>
      </span>
    </label>
  );
}

export function RoomSettingsPanel({ state, onUpdateSettings, disabled = false }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isModerator = isMeModerator(state);
  const panelId = useId();
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);

  const policyLabel = (policy: PermissionPolicy) =>
    policy === "anyone" ? t("room.policyLabel.anyone") : t("room.policyLabel.moderatorOnly");

  const spectatorsState = state.settings.allowSpectators ? t("landing.settingOn") : t("landing.settingOff");
  const summary = `${t("room.revealVotes")}: ${policyLabel(state.settings.revealPolicy)} • ${t(
    "room.allowSpectators"
  )}: ${spectatorsState}`;

  useEffect(() => {
    if (open) {
      firstFieldRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open || disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreFocusRef.current = true;
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, open]);

  useEffect(() => {
    if (!open && restoreFocusRef.current) {
      triggerRef.current?.focus();
      restoreFocusRef.current = false;
    }
  }, [open]);

  if (!isModerator) {
    return null;
  }

  const handlePolicyUpdate = (
    key: keyof Pick<RoomSettings, "revealPolicy" | "resetPolicy" | "deckChangePolicy">
  ) => {
    return (value: PermissionPolicy) => {
      void onUpdateSettings({ [key]: value } as Partial<RoomSettings>);
    };
  };

  const handleBooleanUpdate = (
    key: keyof Pick<RoomSettings, "allowNameChange" | "allowSelfRoleSwitch" | "allowSpectators">
  ) => {
    return (value: boolean) => {
      void onUpdateSettings({ [key]: value } as Partial<RoomSettings>);
    };
  };

  return (
    <div className="controls-panel__section controls-panel__section--settings">
      <button
        ref={triggerRef}
        type="button"
        className="controls-panel__disclosure"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="controls-panel__disclosure-copy">
          <span className="section-label">{t("room.settingsTitle")}</span>
          <span className="controls-panel__disclosure-state">{summary}</span>
        </span>
        <DisclosureChevron open={open} />
      </button>

      {open ? (
        <div
          className="controls-panel__transfer-disclosure controls-panel__settings-disclosure"
          id={panelId}
          role="group"
          aria-label={t("room.settingsTitle")}
        >
          <div className="controls-panel__settings-group">
            <div className="section-label">{t("room.roundPolicies")}</div>
            <div className="controls-panel__settings-fields">
              <PolicySetting
                inputRef={firstFieldRef}
                label={t("room.revealVotes")}
                description={t("room.revealPolicyHint")}
                value={state.settings.revealPolicy}
                disabled={disabled}
                onChange={handlePolicyUpdate("revealPolicy")}
              />
              <PolicySetting
                label={t("room.resetRound")}
                description={t("room.resetPolicyHint")}
                value={state.settings.resetPolicy}
                disabled={disabled}
                onChange={handlePolicyUpdate("resetPolicy")}
              />
              <PolicySetting
                label={t("room.deckChangePolicy")}
                description={t("room.deckChangePolicyHint")}
                value={state.settings.deckChangePolicy}
                disabled={disabled}
                onChange={handlePolicyUpdate("deckChangePolicy")}
              />
            </div>
          </div>

          <div className="controls-panel__settings-group">
            <div className="section-label">{t("room.participantOptions")}</div>
            <div className="controls-panel__setting-toggle-grid">
              <ToggleSetting
                label={t("room.allowNameChange")}
                description={t("room.allowNameChangeHint")}
                checked={state.settings.allowNameChange}
                disabled={disabled}
                onChange={handleBooleanUpdate("allowNameChange")}
              />
              <ToggleSetting
                label={t("room.allowSelfRoleSwitch")}
                description={t("room.allowSelfRoleSwitchHint")}
                checked={state.settings.allowSelfRoleSwitch}
                disabled={disabled}
                onChange={handleBooleanUpdate("allowSelfRoleSwitch")}
              />
              <ToggleSetting
                label={t("room.allowSpectators")}
                description={t("room.allowSpectatorsHint")}
                checked={state.settings.allowSpectators}
                disabled={disabled}
                onChange={handleBooleanUpdate("allowSpectators")}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
