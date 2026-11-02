import { describe, expect, it } from "vitest";

import { InputLayer } from "./input-layer";
import { FakeEvents } from "./testing/fakes";

/** Something that holds on to input, as each device does. */
class Holder {
  letGoes = 0;

  letGo(): void {
    this.letGoes += 1;
  }
}

class FakeDocument extends FakeEvents<Event> {
  hidden = false;
}

function setUp() {
  const holders = [new Holder(), new Holder()];
  const window = new FakeEvents<Event>();
  const page = new FakeDocument();
  return { holders, window, page, layer: new InputLayer(holders, window, page) };
}

describe("InputLayer", () => {
  it("lets go of everything when the window loses the focus", () => {
    const { holders, window } = setUp();

    window.fire("blur", new Event("blur"));

    expect(holders.map((holder) => holder.letGoes)).toEqual([1, 1]);
  });

  it("lets go of everything when a call or a locked screen hides the page", () => {
    const { holders, page } = setUp();

    page.hidden = true;
    page.fire("visibilitychange", new Event("visibilitychange"));

    expect(holders.map((holder) => holder.letGoes)).toEqual([1, 1]);
  });

  it("holds on when the page comes back", () => {
    const { holders, page } = setUp();

    page.fire("visibilitychange", new Event("visibilitychange"));

    expect(holders.map((holder) => holder.letGoes)).toEqual([0, 0]);
  });

  it("keeps a long press's menu off the screen", () => {
    const { window } = setUp();
    const longPress = new Event("contextmenu", { cancelable: true });

    window.fire("contextmenu", longPress);

    expect(longPress.defaultPrevented).toBe(true);
  });
});
