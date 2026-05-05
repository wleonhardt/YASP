import { useEffect, useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PublicRoomState } from "@yasp/shared";
import { isMeModerator } from "../lib/room";

type Props = {
  state: PublicRoomState;
  disabled?: boolean;
  onUpdateStoryLabel: (label: string) => Promise<boolean> | boolean;
  onAddStoryAgendaItems: (labels: string[]) => Promise<boolean> | boolean;
  onRemoveStoryAgendaItem: (itemId: string) => Promise<boolean> | boolean;
  onMoveStoryAgendaItem: (itemId: string, direction: "up" | "down") => Promise<boolean> | boolean;
  onStartNextStory: () => Promise<boolean> | boolean;
};

function parseBulkLabels(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function StoryAgenda({
  state,
  disabled = false,
  onUpdateStoryLabel,
  onAddStoryAgendaItems,
  onRemoveStoryAgendaItem,
  onMoveStoryAgendaItem,
  onStartNextStory,
}: Props) {
  const { t } = useTranslation();
  const isModerator = isMeModerator(state);
  const storyInputId = useId();
  const addInputId = useId();
  const bulkInputId = useId();
  const agendaId = useId();
  const [storyLabel, setStoryLabel] = useState(state.currentStoryLabel ?? "");
  const [addLabel, setAddLabel] = useState("");
  const [bulkLabels, setBulkLabels] = useState("");
  const canEdit = isModerator && !disabled;
  const hasQueue = state.storyQueue.length > 0;

  useEffect(() => {
    setStoryLabel(state.currentStoryLabel ?? "");
  }, [state.currentStoryLabel]);

  const handleStorySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) {
      return;
    }

    await onUpdateStoryLabel(storyLabel);
  };

  const handleAddSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = addLabel.trim();
    if (!canEdit || label.length === 0) {
      return;
    }

    const added = await onAddStoryAgendaItems([label]);
    if (added) {
      setAddLabel("");
    }
  };

  const handleBulkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const labels = parseBulkLabels(bulkLabels);
    if (!canEdit || labels.length === 0) {
      return;
    }

    const added = await onAddStoryAgendaItems(labels);
    if (added) {
      setBulkLabels("");
    }
  };

  return (
    <section className="story-agenda" aria-labelledby={agendaId}>
      <div className="story-agenda__current">
        <div className="story-agenda__copy">
          <div className="section-label" id={agendaId}>
            {t("room.story.current")}
          </div>
          {canEdit ? (
            <form className="story-agenda__current-form" onSubmit={(event) => void handleStorySubmit(event)}>
              <label className="sr-only" htmlFor={storyInputId}>
                {t("room.story.currentLabel")}
              </label>
              <input
                id={storyInputId}
                className="input story-agenda__current-input"
                type="text"
                value={storyLabel}
                maxLength={120}
                placeholder={t("room.story.currentPlaceholder")}
                onChange={(event) => setStoryLabel(event.target.value)}
                disabled={disabled}
              />
              <button
                className="button button--secondary story-agenda__save"
                type="submit"
                disabled={disabled}
              >
                {t("room.story.save")}
              </button>
            </form>
          ) : (
            <div className="story-agenda__current-readonly">
              {state.currentStoryLabel ?? t("room.story.none")}
            </div>
          )}
        </div>

        {isModerator ? (
          <button
            className="button button--primary story-agenda__next"
            type="button"
            onClick={() => void onStartNextStory()}
            disabled={disabled || !hasQueue}
          >
            {t("room.story.startNext")}
          </button>
        ) : null}
      </div>

      {(isModerator || hasQueue) && (
        <details className="story-agenda__details">
          <summary className="story-agenda__summary">
            <span>{t("room.story.agenda")}</span>
            <span className="ui-chip ui-chip--neutral">
              {t("room.story.queueCount", { count: state.storyQueue.length })}
            </span>
          </summary>

          <div className="story-agenda__body">
            {hasQueue ? (
              <ol className="story-agenda__list">
                {state.storyQueue.map((item, index) => (
                  <li key={item.id} className="story-agenda__item">
                    <span className="story-agenda__item-label">{item.label}</span>
                    {isModerator ? (
                      <div className="story-agenda__item-actions">
                        <button
                          className="button button--ghost story-agenda__item-action"
                          type="button"
                          onClick={() => void onMoveStoryAgendaItem(item.id, "up")}
                          disabled={disabled || index === 0}
                          aria-label={t("room.story.moveUp", { label: item.label })}
                        >
                          {t("room.story.up")}
                        </button>
                        <button
                          className="button button--ghost story-agenda__item-action"
                          type="button"
                          onClick={() => void onMoveStoryAgendaItem(item.id, "down")}
                          disabled={disabled || index === state.storyQueue.length - 1}
                          aria-label={t("room.story.moveDown", { label: item.label })}
                        >
                          {t("room.story.down")}
                        </button>
                        <button
                          className="button button--ghost story-agenda__item-action"
                          type="button"
                          onClick={() => void onRemoveStoryAgendaItem(item.id)}
                          disabled={disabled}
                          aria-label={t("room.story.removeLabel", { label: item.label })}
                        >
                          {t("room.story.remove")}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="story-agenda__empty">{t("room.story.empty")}</p>
            )}

            {isModerator ? (
              <div className="story-agenda__editors">
                <form className="story-agenda__add-form" onSubmit={(event) => void handleAddSubmit(event)}>
                  <label className="field story-agenda__add-field" htmlFor={addInputId}>
                    <span className="field__label">{t("room.story.addOne")}</span>
                    <input
                      id={addInputId}
                      className="input"
                      type="text"
                      value={addLabel}
                      maxLength={120}
                      onChange={(event) => setAddLabel(event.target.value)}
                      disabled={disabled}
                    />
                  </label>
                  <button
                    className="button button--secondary"
                    type="submit"
                    disabled={disabled || addLabel.trim().length === 0}
                  >
                    {t("room.story.add")}
                  </button>
                </form>

                <form className="story-agenda__bulk-form" onSubmit={(event) => void handleBulkSubmit(event)}>
                  <label className="field" htmlFor={bulkInputId}>
                    <span className="field__label">{t("room.story.bulk")}</span>
                    <textarea
                      id={bulkInputId}
                      className="input story-agenda__bulk-input"
                      value={bulkLabels}
                      rows={4}
                      placeholder={t("room.story.bulkPlaceholder")}
                      onChange={(event) => setBulkLabels(event.target.value)}
                      disabled={disabled}
                    />
                  </label>
                  <button
                    className="button button--secondary"
                    type="submit"
                    disabled={disabled || parseBulkLabels(bulkLabels).length === 0}
                  >
                    {t("room.story.addLines")}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </details>
      )}
    </section>
  );
}
