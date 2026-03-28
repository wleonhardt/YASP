import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../hooks/useSocket", () => ({
  useSocket: () => ({
    socket: {} as never,
    status: "connected" as const,
  }),
}));

vi.mock("../hooks/useSession", () => ({
  useSession: () => ({
    sessionId: "session-1",
    storedName: "",
  }),
}));

vi.mock("../hooks/useRoom", () => ({
  useRoom: () => ({
    createRoom: mocks.createRoom,
    joinRoom: mocks.joinRoom,
    error: null,
  }),
}));

describe("LandingPage create room deck behavior", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.createRoom.mockReset();
    mocks.joinRoom.mockReset();

    mocks.createRoom.mockResolvedValue({
      ok: true,
      data: {
        roomId: "ABCD12",
        state: {} as never,
      },
    });
  });

  it("keeps the default create-room payload when no customization is applied", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.type(
      screen.getByPlaceholderText("Enter your display name"),
      "Taylor"
    );

    const createForm = screen.getByRole("button", { name: "Create room" }).closest("form");
    if (!createForm) {
      throw new Error("Create room form not found");
    }

    await user.selectOptions(
      within(createForm).getByRole("combobox"),
      "powers_of_two"
    );
    await user.click(within(createForm).getByRole("button", { name: "Create room" }));

    await waitFor(() => {
      expect(mocks.createRoom).toHaveBeenCalledWith("Taylor", "voter", {
        type: "powers_of_two",
      });
    });
  });

  it("sends a custom DeckInput only after the user applies customization", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.type(
      screen.getByPlaceholderText("Enter your display name"),
      "Taylor"
    );

    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    await user.type(screen.getByLabelText("Cards"), "1 2 3 5");
    await user.click(screen.getByRole("button", { name: "Use deck" }));

    expect(
      screen.getByText("Using custom deck: Custom · ? on · ☕ off")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create room" }));

    await waitFor(() => {
      expect(mocks.createRoom).toHaveBeenCalledWith("Taylor", "voter", {
        type: "custom",
        label: "Custom",
        cards: ["1", "2", "3", "5", "?"],
      });
    });
  });

  it("clears a custom override when the base deck select changes", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.type(
      screen.getByPlaceholderText("Enter your display name"),
      "Taylor"
    );

    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    await user.type(screen.getByLabelText("Cards"), "1 2 3 5");
    await user.click(screen.getByRole("button", { name: "Use deck" }));

    expect(screen.getByText(/Using custom deck:/)).toBeInTheDocument();

    const createForm = screen.getByRole("button", { name: "Create room" }).closest("form");
    if (!createForm) {
      throw new Error("Create room form not found");
    }

    await user.selectOptions(
      within(createForm).getByRole("combobox"),
      "modified_fibonacci"
    );

    expect(screen.queryByText(/Using custom deck:/)).not.toBeInTheDocument();

    await user.click(within(createForm).getByRole("button", { name: "Create room" }));

    await waitFor(() => {
      expect(mocks.createRoom).toHaveBeenCalledWith("Taylor", "voter", {
        type: "modified_fibonacci",
      });
    });
  });
});
