import { describe, expect, it } from "vitest";
import { MessengerMenu } from "./messenger-menu";

describe("MessengerMenu: the satellite messenger's menu, worked by its buttons (#284)", () => {
  it("has start tracking, check-in and the weather, stop once it tracks, and the forecast once one has come", () => {
    expect(MessengerMenu.rows(false, false)).toEqual(["track", "check-in", "weather"]);
    expect(MessengerMenu.rows(true, false)).toEqual(["stop", "check-in", "weather"]);
    expect(MessengerMenu.rows(true, true)).toEqual(["stop", "check-in", "weather", "forecast"]);
  });

  it("moves the bar with up and down, round and round, and OK does the row it's on", () => {
    const menu = new MessengerMenu();
    const rows = MessengerMenu.rows(false, false);

    expect(menu.ok(rows)).toBe("track");
    menu.down(rows);
    expect(menu.ok(rows)).toBe("check-in");
    menu.down(rows);
    menu.down(rows);
    expect(menu.picked(rows)).toBe(0);
    menu.up(rows);
    expect(menu.ok(rows)).toBe("weather");
    // A finger on a row puts the bar there.
    menu.pick(1, rows);
    expect(menu.ok(rows)).toBe("check-in");
  });

  it("opens the forecast on OK, goes from day to day with up and down, and comes back with back", () => {
    const menu = new MessengerMenu();
    const rows = MessengerMenu.rows(false, true);
    menu.pick(3, rows);

    expect(menu.ok(rows)).toBe("forecast");
    expect(menu.screen).toBe("forecast");
    expect(menu.day).toBe(0);
    menu.down(rows);
    menu.down(rows);
    menu.down(rows);
    expect(menu.day).toBe(2);
    menu.up(rows);
    expect(menu.day).toBe(1);
    // OK on the forecast does nothing; back goes to the menu, the bar where it was.
    expect(menu.ok(rows)).toBeNull();
    menu.back();
    expect(menu.screen).toBe("menu");
    expect(menu.picked(rows)).toBe(3);
  });

  it("keeps the bar on a row there is when the rows grow fewer", () => {
    const menu = new MessengerMenu();
    menu.pick(3, MessengerMenu.rows(false, true));

    expect(menu.picked(MessengerMenu.rows(false, false))).toBe(2);
  });
});
