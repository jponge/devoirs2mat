import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { boot } from "@/boot";

// `boot` renders into a container of its own rather than through Testing
// Library's render, so it cleans up after itself here.
const containers = [];

function freshContainer() {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  return container;
}

afterEach(() => {
  while (containers.length > 0) {
    containers.pop().remove();
  }
});

describe("boot", () => {
  it("renders the application", async () => {
    // `createRoot().render()` is asynchronous, so the assertion has to wait for
    // React to flush rather than reading an empty container.
    await act(async () => {
      boot(freshContainer());
    });

    expect(screen.getByRole("heading", { name: "Devoirs2mat" })).not.toBeNull();
  });

  // The link that actually carries a startup database failure to the user.
  // Milestone 6 turns this into a toast; until then the point of the test is
  // that a refactor cannot quietly drop the wiring.
  it("hands a startup error to the application", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("the database did not open");

    await act(async () => {
      boot(freshContainer(), failure);
    });

    expect(logged).toHaveBeenCalled();
    expect(logged.mock.calls.flat()).toContain(failure);
  });

  it("reports no error when startup succeeded", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      boot(freshContainer());
    });

    expect(logged).not.toHaveBeenCalled();
  });
});
