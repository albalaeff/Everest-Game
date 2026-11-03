import { describe, expect, it } from "vitest";

import { RoomCode } from "./room-code";

describe("RoomCode", () => {
  it("is five letters and digits without the look-alikes: no O and 0, no I and 1", () => {
    expect(RoomCode.ALPHABET).toHaveLength(32);
    for (const lookAlike of ["O", "0", "I", "1"]) {
      expect(RoomCode.ALPHABET).not.toContain(lookAlike);
    }
    expect(RoomCode.parse("K7PX3")?.text).toBe("K7PX3");
    expect(RoomCode.parse("K7PX")).toBeNull();
    expect(RoomCode.parse("K7PX3Z")).toBeNull();
    expect(RoomCode.parse("K7PX0")).toBeNull();
    expect(RoomCode.parse("K7PXI")).toBeNull();
    expect(RoomCode.parse("")).toBeNull();
  });

  it("takes a code typed in any case, with spaces around it", () => {
    expect(RoomCode.parse(" k7px3 ")?.text).toBe("K7PX3");
    expect(String(RoomCode.parse("k7Px3"))).toBe("K7PX3");
  });

  it("draws a code from random bytes, one a character", () => {
    expect(RoomCode.drawn(new Uint8Array([0, 1, 31, 32, 255])).text).toBe("AB9A9");
    expect(RoomCode.drawn(new Uint8Array([0, 1, 31, 32, 255, 7])).text).toBe("AB9A9");
    expect(() => RoomCode.drawn(new Uint8Array(4))).toThrow(RangeError);
  });

  it("draws every character as often as any other: a byte's low five bits pick it", () => {
    const counts = new Map<string, number>();

    for (let byte = 0; byte < 256; byte += 1) {
      const first = RoomCode.drawn(new Uint8Array([byte, 0, 0, 0, 0])).text.charAt(0);
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }

    expect([...counts.keys()].sort().join("")).toBe([...RoomCode.ALPHABET].sort().join(""));
    expect([...counts.values()]).toEqual(Array.from({ length: 32 }, () => 8));
  });
});
