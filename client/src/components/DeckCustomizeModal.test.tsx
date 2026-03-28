import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeckCustomizeModal } from "./DeckCustomizeModal";

function getPreviewCards() {
  return Array.from(document.querySelectorAll(".deck-chip")).map((element) => element.textContent);
}

describe("DeckCustomizeModal", () => {
  it("focuses the close button on open and resets to the new base deck defaults when reopened", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onApply = vi.fn();

    const { rerender } = render(
      <DeckCustomizeModal open baseDeckType="fibonacci" onClose={onClose} onApply={onApply} />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close deck customization" })).toHaveFocus();
    });

    await user.click(screen.getByRole("tab", { name: "Custom" }));
    await user.type(screen.getByLabelText("Cards"), "1 2 3");

    expect(getPreviewCards()).toEqual(["1", "2", "3", "?"]);

    rerender(
      <DeckCustomizeModal open={false} baseDeckType="fibonacci" onClose={onClose} onApply={onApply} />
    );

    rerender(
      <DeckCustomizeModal open baseDeckType="modified_fibonacci" onClose={onClose} onApply={onApply} />
    );

    expect(getPreviewCards()).toEqual(["0", "0.5", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?"]);
  });

  it("renders the coffee card preview with the text label instead of the emoji glyph", async () => {
    const user = userEvent.setup();

    render(<DeckCustomizeModal open baseDeckType="fibonacci" onClose={vi.fn()} onApply={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Advanced" }));
    await user.click(screen.getByRole("checkbox", { name: /Include Coffee break/i }));

    expect(getPreviewCards()).toEqual(["0", "1", "2", "3", "5", "8", "13", "21", "Coffee", "?"]);
  });
});
