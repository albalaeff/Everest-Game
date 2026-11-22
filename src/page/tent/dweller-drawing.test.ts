import { describe, expect, it } from "vitest";
import { KNOWLEDGE_FILES } from "../../content/knowledge-files";
import { KnowledgeBase } from "../../content/knowledge-base";
import { TentFacts } from "../../content/tent-facts";
import { FrontShapes } from "../../rendering/front-shapes";
import { DwellerDrawing } from "./dweller-drawing";
import type { LimbFrame, LimbName } from "./dweller-drawing";
import { DwellerHands } from "./dweller-hands";
import { DwellerHead } from "./dweller-head";
import { DwellerPose } from "./dweller-pose";
import type { Spot } from "./dweller-pose";
import { DwellerShapes } from "./dweller-shapes";
import { TentArt } from "./tent-art";

const SEAT = { x: 640, y: 574 };
const drawing = new DwellerDrawing(SEAT);
const pose = new DwellerPose();
/** The lamp's way, up and to the right. */
const LAMP = { x: 0.55, y: -0.83 };
const LIMBS: readonly LimbName[] = [
  "upper0",
  "fore0",
  "upper1",
  "fore1",
  "thigh0",
  "shin0",
  "foot0",
  "thigh1",
  "shin1",
  "foot1",
];

/** The numbers of a path or a transform, in the order they're written. */
function numbers(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/gu)].map(([found]) => Number(found));
}

/** Where a limb's frame is: its root, its angle in degrees, and how much of its length shows. */
function placed(limb: LimbFrame): { x: number; y: number; angle: number; short: number } {
  const [x = 0, y = 0, angle = 0, short = 0] = numbers(limb.transform);
  return { x, y, angle, short };
}

/** Whether a path's shape has `spot` inside it: a path of straight lines, filled even-odd. */
function inside(path: string, { x, y }: Spot): boolean {
  let crossings = 0;
  for (const shape of path.split("M").slice(1)) {
    const points: Spot[] = [];
    let at = { x: 0, y: 0 };
    for (const [, letter = "", rest = ""] of `M${shape}`.matchAll(/([MLHVZ])([^MLHVZ]*)/gu)) {
      const [a = 0, b = 0] = numbers(rest);
      at = letter === "H" ? { x: a, y: at.y } : letter === "V" ? { x: at.x, y: a } : { x: a, y: b };
      if (letter !== "Z") {
        points.push(at);
      }
    }
    points.forEach((from, index) => {
      const to = points[(index + 1) % points.length] ?? from;
      if (
        from.y > y !== to.y > y &&
        x < from.x + ((y - from.y) / (to.y - from.y)) * (to.x - from.x)
      ) {
        crossings += 1;
      }
    });
  }
  return crossings % 2 === 1;
}

describe("DwellerDrawing: the person in the tent as a drawing (#258, #264, #269, #274)", () => {
  it("draws the slope's climber in parts: the quilted body and limbs, each hand in three places round its sleeve and what it holds, and a head with a face", () => {
    const markup = drawing.markup();

    for (const part of [
      "all",
      "torso",
      ...LIMBS,
      "fore0-drop",
      "fore1-drop",
      "back0",
      "mid0",
      "held0",
      "carried0",
      "hand0",
      "back1",
      "mid1",
      "held1",
      "carried1",
      "hand1",
      "neck",
      "neck-under",
      "neck-stubble",
      "neck-muscle",
      "neck-muscle-shade",
      "neck-clip",
      "neck-shade",
      "neck-growth",
      "head",
      "guitar",
      "pouch",
      "lump",
      "stream",
      "stream-light",
      "dip",
    ]) {
      expect(markup).toContain(`data-part="${part}"`);
    }
    for (const kit of [
      "dw-baffle",
      "dw-seam",
      "dw-yoke",
      "dw-zip",
      "dw-cuff",
      "dw-panel",
      "dw-sole",
    ]) {
      expect(markup).toContain(`class="${kit}"`);
    }
    for (const face of ["dw-iris", "dw-lid-skin", "dw-brow", "dw-nose", "dw-lip-upper", "dw-ear"]) {
      expect(markup).toContain(face);
    }
    // Each hand has room for all its parts in each of its three places, and every thing a hand
    // holds.
    expect(markup.match(/class="dw-part"/gu)).toHaveLength(2 * 3 * DwellerHands.PARTS);
    for (const held of [
      "spoon",
      "stirrer",
      "bottle",
      "bar",
      "pouch",
      "lifted",
      "snow",
      "lighter",
      "pot",
    ]) {
      expect(markup.match(new RegExp(`data-held="${held}"`, "gu"))).toHaveLength(2);
    }
  });

  it("draws the neck behind the base layer's collar and the head, and sets it to each pose, from the collar up into the head (#277)", () => {
    const markup = drawing.markup();
    const at = (found: string): number => markup.indexOf(found);
    const neck = drawing.frame(pose.look("melt", 2)).neck;

    // Over the back of the collar and the opening, under the collar's front and the head.
    expect(at('data-part="neck"')).toBeGreaterThan(at('class="dw-base-layer-back"'));
    expect(at('data-part="neck"')).toBeLessThan(markup.lastIndexOf('class="dw-base-layer"'));
    expect(at('data-part="neck-muscle"')).toBeLessThan(at('data-part="head"'));
    // A closed outline down one side and up the other, its muscle and its shadings' ends.
    expect(neck.outline).toMatch(/^M[^C]+C[^L]+L[^C]+C[^Z]+Z$/u);
    expect(neck.muscle).toMatch(/^M[^C]+C/u);
    expect(neck.shade).toHaveLength(4);
    expect(neck.growth).toHaveLength(4);
  });

  it("draws the upper arms behind the body, so an arm never comes away from the shoulder, and each forearm in front of it among its hand's parts", () => {
    const markup = drawing.markup();
    const at = (part: string): number => markup.indexOf(`data-part="${part}"`);

    for (const side of [0, 1]) {
      expect(at(`upper${side}`)).toBeLessThan(at("torso"));
      // The pot, then what of the hand is behind the sleeve's cuff, the sleeve, what's between
      // it and what's held, what's held, and what's in front of that.
      expect(at(`carried${side}`)).toBeGreaterThan(at("torso"));
      expect(at(`back${side}`)).toBeGreaterThan(at(`carried${side}`));
      expect(at(`fore${side}`)).toBeGreaterThan(at(`back${side}`));
      expect(at(`mid${side}`)).toBeGreaterThan(at(`fore${side}`));
      expect(at(`held${side}`)).toBeGreaterThan(at(`mid${side}`));
      expect(at(`hand${side}`)).toBeGreaterThan(at(`held${side}`));
    }
    // A pouch set down on the lap, on the legs and under the arms.
    expect(at("pouch")).toBeGreaterThan(at("guitar"));
    expect(at("pouch")).toBeLessThan(at("carried1"));
    // The near arm in front of the face, for the spoon to come to the mouth.
    expect(at("carried0")).toBeGreaterThan(at("head"));
    expect(at("hand1")).toBeLessThan(at("head"));
  });

  it("sits them on their seat, whole, their eyes open, their mouth shut and their hands open and empty", () => {
    const frame = drawing.frame(pose.look("idle", 1));

    expect(frame.all).toBe("translate(640 574)");
    expect(frame.shown).toBe(1);
    expect(frame.eyes).toBe(1);
    expect(frame.mouth).toBe(0);
    expect(frame.grips).toEqual(["open", "open"]);
    expect(frame.holds).toEqual(["nothing", "nothing"]);
    expect(frame.guitar).toBe(false);
    expect(frame.stream).toBe("");
    expect(frame.lump).toBeNull();
    expect(frame.pouch).toBeNull();
    expect(frame.dip).toBe(DwellerDrawing.EVERYWHERE);
  });

  it("draws each limb along its bone, shorter where it comes toward the viewer and never longer", () => {
    for (const [act, seconds] of [
      ["idle", 1],
      ["melt", 2.5],
      ["fill", 3.3],
      ["eat", 1.8],
      ["drink", 1.8],
      ["guitar", 0.4],
      ["enter", 0.6],
    ] as const) {
      const frame = drawing.frame(pose.look(act, seconds));
      for (const name of LIMBS) {
        const { short } = placed(frame.limbs[name]);
        expect(short).toBeGreaterThan(0.2);
        expect(short).toBeLessThanOrEqual(1);
      }
    }
    // Sitting, the forearms reach a little forward to the knees.
    expect(placed(drawing.frame(pose.look("idle", 1)).limbs.fore0).short).toBeLessThan(0.95);
  });

  it("ends each sleeve at the wrist, and sets the hand on it", () => {
    for (const [act, seconds] of [
      ["melt", 2.5],
      ["pour", 2.4],
      ["eat", 1.8],
    ] as const) {
      const look = pose.look(act, seconds);
      const joints = pose.joints(look);
      const frame = drawing.frame(look);
      [frame.limbs.fore0, frame.limbs.fore1].forEach((limb, side) => {
        const fore = placed(limb);
        const length = DwellerShapes.FOREARM * fore.short;
        const [elbow, wrist] = [joints.elbows[side], joints.wrists[side]];
        expect(fore.x).toBeCloseTo(elbow?.x ?? NaN, 1);
        expect(fore.y).toBeCloseTo(elbow?.y ?? NaN, 1);
        expect(fore.x + length * Math.cos((fore.angle * Math.PI) / 180)).toBeCloseTo(
          wrist?.x ?? NaN,
          0,
        );
        expect(fore.y + length * Math.sin((fore.angle * Math.PI) / 180)).toBeCloseTo(
          wrist?.y ?? NaN,
          0,
        );
      });
      // The hand round its wrist: each of its parts begins within a hand's length of it.
      frame.hands.forEach((hand, side) => {
        const wrist = joints.wrists[side] ?? { x: NaN, y: NaN };
        for (const { skin } of [...hand.back, ...hand.mid, ...hand.front]) {
          const [x = NaN, y = NaN] = numbers(skin);
          expect(Math.hypot(x - wrist.x, y - wrist.y)).toBeLessThan(215 * DwellerHands.SCALE);
        }
      });
    }
  });

  it("draws what a hand holds in the thing's own frame: where the hand grips, pointing the way it's held, upright or tipped whichever way the wrist is bent", () => {
    const upright = pose.look("pour", 1);
    const tipped = pose.look("pour", 2.6);

    for (const look of [upright, tipped]) {
      const joints = pose.joints(look);
      const frame = drawing.frame(look);
      const [x = 0, y = 0, aim = 0] = numbers(frame.held[0]);
      expect(frame.holds[0]).toBe("bottle");
      expect(frame.grips[0]).toBe("wrap");
      expect(x).toBeCloseTo(joints.hands[0].x, 1);
      expect(y).toBeCloseTo(joints.hands[0].y, 1);
      expect(aim).toBeCloseTo(joints.aims[0], 1);
      expect(frame.held[0]).not.toContain("scale");
    }
    expect(Math.abs(numbers(drawing.frame(upright).held[0])[2] ?? NaN)).toBeLessThan(5);
    expect(Math.abs(numbers(drawing.frame(tipped).held[0])[2] ?? NaN)).toBeGreaterThan(90);
  });

  it("lights each limb on its side toward the lamp, whichever way the pose turns it", () => {
    for (const [act, seconds] of [
      ["idle", 1],
      ["wake", 1.08],
      ["melt", 2.2],
    ] as const) {
      const frame = drawing.frame(pose.look(act, seconds));
      for (const name of LIMBS) {
        const { lit } = frame.limbs[name];
        const { angle } = placed(frame.limbs[name]);
        const radians = (angle * Math.PI) / 180;
        // The limb's own +y side, on the screen.
        const plus = { x: -Math.sin(radians), y: Math.cos(radians) };
        const toward = plus.x * LAMP.x + plus.y * LAMP.y;
        expect(lit === "plus" ? toward : -toward).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("drops each arm's shadow down and to the left of it", () => {
    const frame = drawing.frame(pose.look("idle", 1));
    const drop = DwellerDrawing.drop(frame.limbs.upper0);

    expect(drop.startsWith("translate(-3 4) ")).toBe(true);
    expect(drop.endsWith(frame.limbs.upper0.transform)).toBe(true);
  });

  it("shuts the eyes in a blink, opens the mouth for a spoonful, and pinches the spoon while the other hand lies across the pouch", () => {
    const frames = Array.from({ length: 160 }, (_, index) =>
      drawing.frame(pose.look("eat", 0.5 + index / 20)),
    );

    expect(Math.min(...frames.map(({ eyes }) => eyes))).toBeLessThan(0.3);
    expect(Math.max(...frames.map(({ mouth }) => mouth))).toBeGreaterThan(0.8);
    expect(frames.every(({ holds }) => ["spoon", "spoonful"].includes(holds[0]))).toBe(true);
    expect(frames.every(({ holds }) => holds[1] === "pouch")).toBe(true);
    expect(frames.every(({ grips }) => grips[0] === "pinch" && grips[1] === "plate")).toBe(true);
  });

  it("looks where the pose looks, as far as the eye turns", () => {
    const frame = drawing.frame({ ...pose.look("idle", 1), gaze: { x: 5, y: -1 } });

    expect(frame.gaze.x).toBeCloseTo(DwellerHead.GAZE.x, 6);
    expect(frame.gaze.y).toBeCloseTo(-DwellerHead.GAZE.y, 6);
  });

  it("pours the bottle's water into the pot while it's tipped over it, and not as it's drunk from", () => {
    const pouring = drawing.frame(pose.look("pour", 2.6));
    const drinking = drawing.frame(pose.look("drink", 1.8));

    expect(pouring.holds[0]).toBe("bottle");
    expect(pouring.stream).not.toBe("");
    const [fromX = 0, fromY = 0, , , toX = 0, toY = 0] = numbers(pouring.stream);
    // From over the pot in the vestibule, left of the seat, down into it.
    expect(Math.abs(fromX - DwellerPose.POT.x)).toBeLessThan(DwellerPose.POT_INSIDE.half);
    expect(fromY).toBeLessThan(DwellerPose.POT.y);
    expect(Math.abs(toX - DwellerPose.POT.x)).toBeLessThan(DwellerPose.POT_INSIDE.half);
    expect(toY).toBeGreaterThan(DwellerPose.POT.y);
    expect(drinking.holds[0]).toBe("bottle");
    expect(drinking.stream).toBe("");
  });

  it("cuts off what goes into the pot at its rim: the spoon that stirs, the lump of snow and the water", () => {
    const stirring = drawing.frame(pose.look("melt", 1.2));
    const { POT, POT_INSIDE } = DwellerPose;
    const markup = drawing.markup();

    // Everywhere shows but the pot's inside, below its rim.
    expect(inside(stirring.dip, { x: POT.x, y: POT.y - 4 })).toBe(true);
    expect(inside(stirring.dip, { x: POT.x, y: POT.y + 4 })).toBe(false);
    expect(inside(stirring.dip, { x: POT.x, y: POT.y + POT_INSIDE.deep - 2 })).toBe(false);
    expect(inside(stirring.dip, { x: POT.x - POT_INSIDE.half - 6, y: POT.y + 20 })).toBe(true);
    expect(inside(stirring.dip, { x: 0, y: 0 })).toBe(true);
    // The nearer hand's thing is drawn through that; the spoon left standing, the falling lump
    // and the water through the pot's own.
    expect(markup).toMatch(
      /<g clip-path="url\(#dw-dip\)"><g class="dw-things" data-part="held0">/u,
    );
    expect(markup).toMatch(/<g clip-path="url\(#dw-pot\)"><g class="dw-rest"/u);
    expect(markup).toMatch(/<g clip-path="url\(#dw-pot\)"><g class="dw-lump"/u);
    expect(markup.split('data-part="lump"')[1]).toContain('data-part="stream"');
  });

  it("stands the spoon in the pot where the fist leaves it, and lets the lump of snow fall where the pose has it", () => {
    const { at, aim } = DwellerPose.SPOON_LEFT;
    const falling = pose.look("melt", 7.25);

    expect(drawing.markup()).toContain(
      `<g class="dw-rest" transform="translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${aim.toFixed(1)})">${DwellerHands.stirrer()}</g>`,
    );
    expect(falling.lump).not.toBeNull();
    expect(numbers(drawing.frame(falling).lump ?? "")).toEqual([
      Math.round((falling.lump?.x ?? 0) * 10) / 10,
      Math.round((falling.lump?.y ?? 0) * 10) / 10,
    ]);
  });

  it("cuts the spoon off at the opening of the pouch it eats from, wherever the other hand holds it", () => {
    const look = pose.look("eat", 0.9);
    const joints = pose.joints(look);
    const frame = drawing.frame(look);
    /** A spot of the pouch, across it and up it from where it's held. */
    const onPouch = (across: number, up: number): Spot => {
      const angle = (joints.aims[1] * Math.PI) / 180;
      return {
        x: joints.hands[1].x + across * Math.cos(angle) + up * Math.sin(angle),
        y: joints.hands[1].y + across * Math.sin(angle) - up * Math.cos(angle),
      };
    };

    expect(look.dips).toBe("pouch");
    // Hidden inside it, shown over its top and beside it.
    expect(inside(frame.dip, onPouch(0, 20))).toBe(false);
    expect(inside(frame.dip, onPouch(0, DwellerHands.REACH.pouch - 6))).toBe(false);
    expect(inside(frame.dip, onPouch(0, DwellerHands.REACH.pouch + 6))).toBe(true);
    expect(inside(frame.dip, onPouch(TentArt.POUCH.width / 2 + 5, 20))).toBe(true);
  });

  it("puts the legs under them on hands and knees, their hips off the mats, and fades them in at the door", () => {
    const crawling = drawing.frame(pose.look("enter", 0.3));
    const sitting = drawing.frame(pose.look("idle", 0));
    const down = (limb: LimbFrame): number => Math.sin((placed(limb).angle * Math.PI) / 180);

    expect(crawling.shown).toBeLessThan(1);
    expect(numbers(crawling.all)[0]).toBeLessThan(SEAT.x - 200);
    expect(numbers(crawling.all)[1]).toBeLessThan(SEAT.y - 30);
    // Sitting, the thigh rises out to the knee, up as a man in a down suit sits cross-legged
    // (#285); kneeling, it's down under the hips.
    expect(down(sitting.limbs.thigh0)).toBeLessThan(-0.4);
    expect(down(crawling.limbs.thigh0)).toBeGreaterThan(0.7);
  });

  it("turns them to the pack, mirrored, and lifts a foot with the guitar's beat", () => {
    const packing = drawing.frame(pose.look("pack", 1.2));
    const beats = Array.from({ length: 40 }, (_, index) =>
      drawing.frame(pose.look("guitar", index / 20)),
    );
    const turns = beats.map(({ limbs }) => placed(limbs.foot1).angle);

    expect(packing.all).toContain("scale(-1 1)");
    expect(beats.every(({ guitar }) => guitar)).toBe(true);
    expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(4);
    expect(new Set(beats.map(({ limbs }) => limbs.foot0.transform)).size).toBe(1);
  });

  it("fades them out as they lie down into the bag", () => {
    expect(drawing.frame(pose.look("sleep", 3)).shown).toBe(0);
    expect(drawing.frame(pose.look("lie", 0.6)).shown).toBeGreaterThan(0);
    expect(drawing.frame(pose.look("lie", 0.6)).shown).toBeLessThan(1);
  });
});

describe("DwellerPose: where the tent's things are (#269)", () => {
  const { sizes } = new TentFacts(new KnowledgeBase(KNOWLEDGE_FILES));
  const art = new TentArt(sizes);
  /** The person's hips on the seat, in the picture, as the picture seats them. */
  const seat = {
    x: art.room.from + TentArt.SEAT_IN,
    y: TentArt.FLOOR - TentArt.SEAT - FrontShapes.CROTCH * DwellerShapes.SCALE,
  };
  const from = (x: number, up: number): Spot => ({ x: x - seat.x, y: TentArt.FLOOR - up - seat.y });
  const near = (place: Spot, drawn: Spot): void => {
    expect(place.x).toBeCloseTo(drawn.x, 0);
    expect(place.y).toBeCloseTo(drawn.y, 0);
  };

  it("reaches for the pot, the burner and the pot's handle where the stove stands", () => {
    near(DwellerPose.POT, from(TentArt.STOVE, TentArt.POT.rim));
    near(DwellerPose.BURNER, from(TentArt.STOVE, TentArt.FLAME));
    near(DwellerPose.HANDLE, from(TentArt.STOVE, TentArt.POT.handle));
    // Inside the pot's walls and above its bottom.
    expect(DwellerPose.POT_INSIDE.half).toBeLessThan(TentArt.POT.half);
    expect(DwellerPose.POT_INSIDE.deep).toBe(TentArt.POT.rim - TentArt.POT.bottom);
  });

  it("reaches for the snow where the sack stands, and the bottle and the pouch where the nearest of each stands", () => {
    const pad = TentArt.SEAT - 2;
    const lean = (DwellerPose.MEAL_LEANS * Math.PI) / 180;

    near(DwellerPose.SNOW, from(art.room.from + TentArt.SNOW.into, TentArt.SNOW.top));
    // The nearest bottle by its middle; the nearest meal's pouch where it's held, up its lean.
    near(
      DwellerPose.BOTTLE,
      from(art.room.from + TentArt.BOTTLE_IN, TentArt.BOTTLE.lift + TentArt.BOTTLE.height / 2),
    );
    near(
      DwellerPose.MEAL,
      from(
        art.room.from + TentArt.MEALS_IN + Math.sin(lean) * DwellerHands.POUCH_HELD,
        pad + Math.cos(lean) * DwellerHands.POUCH_HELD,
      ),
    );
    const markup = art.markup();
    expect(markup).toContain(
      `data-bottle="0" transform="translate(${art.room.from + TentArt.BOTTLE_IN} ${TentArt.FLOOR - TentArt.BOTTLE.lift})"`,
    );
    expect(markup).toContain(
      `data-meal="0" transform="translate(${art.room.from + TentArt.MEALS_IN} ${TentArt.FLOOR - pad}) rotate(${DwellerPose.MEAL_LEANS})"`,
    );
  });
});
