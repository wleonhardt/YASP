export type RoomShortcutAction = { type: "vote"; value: string } | { type: "clear" } | null;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function getRoomShortcutAction(
  event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "defaultPrevented" | "target"
  >,
  availableCards: Set<string>,
  selectedCard: string | null
): RoomShortcutAction {
  if (event.defaultPrevented) {
    return null;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return null;
  }

  if (isEditableTarget(event.target)) {
    return null;
  }

  if (event.key === "Escape") {
    return selectedCard ? { type: "clear" } : null;
  }

  if (event.shiftKey) {
    return null;
  }

  if (!availableCards.has(event.key)) {
    return null;
  }

  if (selectedCard === event.key) {
    return { type: "clear" };
  }

  return { type: "vote", value: event.key };
}
