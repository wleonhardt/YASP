import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimerStrip } from "./TimerStrip";
import { makePublicRoomState } from "../test/roomState";

describe("TimerStrip", () => {
  it("shows the shared timer status without moderator controls", () => {
    render(
      <TimerStrip
        state={makePublicRoomState({
          timer: {
            durationSeconds: 60,
            remainingSeconds: 42,
            running: true,
            endsAt: Date.now() + 42_000,
            completedAt: null,
            lastHonkAt: null,
            honkAvailableAt: null,
          },
        })}
      />
    );

    const strip = screen.getByRole("region", { name: /timer/i });

    expect(within(strip).getByText("00:42")).toBeInTheDocument();
    expect(within(strip).getByText("Running")).toHaveAttribute("aria-live", "polite");
    expect(within(strip).queryByRole("button")).not.toBeInTheDocument();
  });
});
