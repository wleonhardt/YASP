import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteHero } from "./InviteHero";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function mockClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  return writeText;
}

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    const holder = navigator as unknown as { clipboard?: Clipboard };
    delete holder.clipboard;
  }
});

describe("InviteHero", () => {
  it("renders the room code and copy action as the primary invite surface", () => {
    render(<InviteHero roomId="ROOM01" onCopyError={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /invite your team/i })).toBeInTheDocument();
    expect(screen.getByText("ROOM01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy room link/i })).toBeInTheDocument();
  });

  it("copies the room URL and announces success", async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();

    render(<InviteHero roomId="ROOM01" onCopyError={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /copy room link/i }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/r/ROOM01`);
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
    expect(screen.getByText(/room link copied/i)).toBeInTheDocument();
  });

  it("reports clipboard failures without changing to the copied state", async () => {
    const user = userEvent.setup();
    const onCopyError = vi.fn();
    mockClipboard(vi.fn().mockRejectedValue(new Error("denied")));

    render(<InviteHero roomId="ROOM01" onCopyError={onCopyError} />);

    await user.click(screen.getByRole("button", { name: /copy room link/i }));

    await waitFor(() => expect(onCopyError).toHaveBeenCalledWith("error", "Couldn't copy the room link"));
    expect(screen.getByRole("button", { name: /copy room link/i })).toBeInTheDocument();
  });
});
