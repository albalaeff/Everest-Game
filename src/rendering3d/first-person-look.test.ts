import { describe, expect, it } from "vitest";

import { FirstPersonLook } from "./first-person-look";
import type { LookDocument, LookHost } from "./first-person-look";

/** A page for the look: an element that keeps its listeners, and a document that holds the
 * pointer once it's asked to. */
class FakePage implements LookHost, LookDocument {
  pointerLockElement: unknown = null;
  asked = 0;
  private readonly listeners = new Map<string, ((event: Event) => void)[]>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  requestPointerLock(): Promise<void> {
    this.asked += 1;
    this.pointerLockElement = this;
    return Promise.resolve();
  }

  fire(type: string, event: object = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }
}

describe("which way the climber looks", () => {
  it("turns left and up by what it's told, and keeps the turn", () => {
    const look = new FirstPersonLook();
    look.face(0, 0);
    look.turn(0.4, 0.1);
    look.turn(0.2, -0.3);
    expect(look.yaw).toBeCloseTo(0.6, 12);
    expect(look.pitch).toBeCloseTo(-0.2, 12);
  });

  it("tips no further than down to the boots and up past the towers", () => {
    const look = new FirstPersonLook();
    look.turn(0, -5);
    expect(look.pitch).toBe(FirstPersonLook.DOWN);
    look.turn(0, 9);
    expect(look.pitch).toBe(FirstPersonLook.UP);
    expect(FirstPersonLook.DOWN).toBeLessThan(-1.3);
  });

  it("takes hold of the mouse on a click, and turns the head by it from then on", () => {
    const page = new FakePage();
    const look = new FirstPersonLook();
    look.face(0, 0);
    look.listen(page, page);
    page.fire("pointermove", { movementX: 100, movementY: 0, pointerType: "mouse", buttons: 0 });
    expect(look.yaw).toBe(0);
    page.fire("click");
    expect(page.asked).toBe(1);
    // The mouse to the right looks right, and down looks down.
    page.fire("pointermove", { movementX: 100, movementY: 50, pointerType: "mouse", buttons: 0 });
    expect(look.yaw).toBeLessThan(0);
    expect(look.pitch).toBeLessThan(0);
    page.fire("click");
    expect(page.asked).toBe(1);
  });

  it("is dragged by a finger: the picture follows the finger", () => {
    const page = new FakePage();
    const look = new FirstPersonLook();
    look.face(0, 0);
    look.listen(page, page);
    page.fire("pointerdown", { clientX: 200, clientY: 200, pointerType: "touch" });
    page.fire("pointermove", { clientX: 260, clientY: 180, pointerType: "touch" });
    // The ground dragged to the right and up: the head has turned left and down.
    expect(look.yaw).toBeGreaterThan(0);
    expect(look.pitch).toBeLessThan(0);
    page.fire("pointerup");
    const { yaw } = look;
    page.fire("pointermove", { clientX: 400, clientY: 180, pointerType: "touch" });
    expect(look.yaw).toBe(yaw);
  });
});
