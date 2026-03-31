import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
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

  it("supports arrow-key navigation between deck customization tabs", async () => {
    const user = userEvent.setup();

    render(<DeckCustomizeModal open baseDeckType="fibonacci" onClose={vi.fn()} onApply={vi.fn()} />);

    const simpleTab = screen.getByRole("tab", { name: "Simple" });
    const advancedTab = screen.getByRole("tab", { name: "Advanced" });
    const customTab = screen.getByRole("tab", { name: "Custom" });

    simpleTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(advancedTab).toHaveFocus();
    expect(advancedTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");

    expect(customTab).toHaveFocus();
    expect(customTab).toHaveAttribute("aria-selected", "true");
  });

  it("returns focus to the opening trigger when closed", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement | null>(null);

      return (
        <>
          <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
            Open deck customization
          </button>
          <DeckCustomizeModal
            open={open}
            baseDeckType="fibonacci"
            onClose={() => setOpen(false)}
            onApply={vi.fn()}
            returnFocusRef={triggerRef}
          />
        </>
      );
    }

    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open deck customization" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Customize deck" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Customize deck" })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});
