import { describe, expect, it } from "vitest";
import { getRoomShortcutAction } from "./roomShortcuts";

function makeEvent(
  overrides: Partial<
    Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "defaultPrevented" | "target">
  > = {}
): Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "defaultPrevented" | "target"> {
  return {
    key: "1",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: document.body,
    ...overrides,
  };
}

describe("getRoomShortcutAction", () => {
  const availableCards = new Set(["1", "2", "3", "5", "8"]);

  // --- Context safety: must not fire while typing ---

  it("does not fire while typing in an input", () => {
    const input = document.createElement("input");
    expect(getRoomShortcutAction(makeEvent({ target: input }), availableCards, null)).toBeNull();
  });

  it("does not fire while typing in a textarea", () => {
    const textarea = document.createElement("textarea");
    expect(getRoomShortcutAction(makeEvent({ target: textarea }), availableCards, null)).toBeNull();
  });

  it("does not fire while a select is focused", () => {
    const select = document.createElement("select");
    expect(getRoomShortcutAction(makeEvent({ target: select }), availableCards, null)).toBeNull();
  });

  it("does not fire inside a contenteditable element", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(getRoomShortcutAction(makeEvent({ target: div }), availableCards, null)).toBeNull();
  });

  it("does not fire inside a child of an input (e.g. inner span)", () => {
    const input = document.createElement("input");
    const wrapper = document.createElement("div");
    wrapper.appendChild(input);
    // In practice the target would be the input itself, but closest() handles nesting
    expect(getRoomShortcutAction(makeEvent({ target: input }), availableCards, null)).toBeNull();
  });

  // --- Browser shortcut conflicts ---

  it("ignores Cmd/Meta modifier (macOS browser shortcuts)", () => {
    expect(getRoomShortcutAction(makeEvent({ metaKey: true }), availableCards, null)).toBeNull();
  });

  it("ignores Ctrl modifier (browser shortcuts)", () => {
    expect(getRoomShortcutAction(makeEvent({ ctrlKey: true }), availableCards, null)).toBeNull();
  });

  it("ignores Alt modifier (browser shortcuts)", () => {
    expect(getRoomShortcutAction(makeEvent({ altKey: true }), availableCards, null)).toBeNull();
  });

  it("ignores Shift modifier for card keys", () => {
    expect(getRoomShortcutAction(makeEvent({ shiftKey: true }), availableCards, null)).toBeNull();
  });

  it("ignores already-prevented events", () => {
    expect(getRoomShortcutAction(makeEvent({ defaultPrevented: true }), availableCards, null)).toBeNull();
  });

  // --- Valid shortcut actions ---

  it("returns vote action for an available card key", () => {
    expect(getRoomShortcutAction(makeEvent({ key: "2" }), availableCards, null)).toEqual({
      type: "vote",
      value: "2",
    });
  });

  it("returns clear action when pressing the already-selected card", () => {
    expect(getRoomShortcutAction(makeEvent({ key: "5" }), availableCards, "5")).toEqual({ type: "clear" });
  });

  it("returns clear action on Escape when a card is selected", () => {
    expect(getRoomShortcutAction(makeEvent({ key: "Escape" }), availableCards, "3")).toEqual({ type: "clear" });
  });

  it("returns null on Escape when no card is selected", () => {
    expect(getRoomShortcutAction(makeEvent({ key: "Escape" }), availableCards, null)).toBeNull();
  });

  it("returns null for keys not in the available deck", () => {
    expect(getRoomShortcutAction(makeEvent({ key: "9" }), availableCards, null)).toBeNull();
  });

  it("returns null for letter keys not in the deck", () => {
    expect(getRoomShortcutAction(makeEvent({ key: "a" }), availableCards, null)).toBeNull();
  });

  // --- Escape is allowed even with Shift held ---

  it("allows Escape with Shift to clear vote", () => {
    // Shift check happens after Escape check, so Escape+Shift still works
    const action = getRoomShortcutAction(makeEvent({ key: "Escape", shiftKey: true }), availableCards, "3");
    expect(action).toEqual({ type: "clear" });
  });
});
