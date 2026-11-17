import { Container, FillGradient, Graphics } from "pixi.js";

import type { Joint } from "./climber-pose";
import { FigureShapes } from "./figure-shapes";
import type { Outline } from "./figure-shapes";
import { FrontShapes } from "./front-shapes";
import type { FrontBoot, FrontLeg, Quilted } from "./front-shapes";
import { KitShading } from "./kit-shading";
import { Palette } from "./palette";
import { SuitRig } from "./suit-rig";

/**
 * A climber in their kit seen from the front (#235), standing, as they are once they've turned to
 * face the viewer: the same kit `SuitRig` draws side-on, on the same bones (`FrontShapes`), painted
 * the same way (`KitShading`), lit from the viewer's right and above. The down suit quilted in its
 * baffles, each puffed between its seams, the dark yoke over the shoulders, the main zip up to the
 * chin, the dark panels down the shins; the gaiters with their collars and zips, the boots with
 * their rands and toe caps, and the crampons' bails, frames and points; the mitts with their
 * gauntlets over the cuffs; the harness with its belt, buckle, belay loop, leg loops and a
 * carabiner on each gear loop; the pack behind, its lid over the shoulders and the oxygen's bottle
 * and regulator over the left one, the straps down the chest and the chest strap across them, and
 * the hose over the shoulder; the hood with its puffed rim round the face, the goggles with the sky
 * in their lens, the headlamp on the brim, and the mask over the face or hanging on the chest, the
 * face showing; and behind it all its silhouette, for the rim of the hour's light the side figure
 * has too. Drawn once, in the figure's metres from the ground between its boots, y up; each frame
 * only the chest swells with the breath, the mask and its hose go on or off, the lens takes the
 * sky's colour, the rim the hour's light, and the cowstails are drawn to their carabiners.
 */
export class FrontRig extends Container {
  /** The shapes, cut once for every figure seen from the front, and how the kit is painted: the
   * same as side-on. */
  private static readonly SHAPES = new FrontShapes();
  private static readonly PAINT = KitShading.SHARED;
  /** Where the lamp shines from and where the breath comes out, in the figure's metres. */
  static readonly LAMP: Joint = FrontRig.SHAPES.lamp;
  static readonly MOUTH: Joint = FrontRig.SHAPES.mouth;
  /** How far below the tie-in a cowstail off the rope hangs, and how far to its side; how big its
   * carabiner is, each side of its middle. */
  private static readonly HANGING = { down: 0.3, aside: 0.16 };
  private static readonly CARABINER = { across: 0.012, along: 0.024 };
  /** The skin of the face, in the hood's shade: its lit middle and its shaded edge. */
  private static readonly SKIN = { lit: 0xb57a58, shade: 0x4a2c20 };
  /** How a part lying on another shades it, down to the left, away from the light: how far, and
   * how dark. */
  private static readonly DROP: Joint = { x: -0.007, y: -0.006 };
  private static readonly DROP_ALPHA = 0.3;
  /** A strap's lit edge, so a dark strap reads on the dark yoke. */
  private static readonly EDGE = { width: 0.004, alpha: 0.16 };
  /** The oxygen hose, and the shine along it. */
  private static readonly HOSE = { width: 0.022, shine: 0.006 };

  /** The figure's silhouette, a little wider, behind it: the rim of the hour's light. */
  private readonly rim = new Graphics();
  private readonly back = new Graphics();
  private readonly legs = new Graphics();
  private readonly torso = new Container();
  private readonly chest = new Graphics();
  private readonly hangingMask = new Graphics();
  private readonly arms = new Graphics();
  private readonly head = new Graphics();
  private readonly lens = new Graphics();
  private readonly shine = new Graphics();
  private readonly hoseOn: Graphics;
  private readonly hoseOff: Graphics;
  private readonly faceMask = new Graphics();
  private readonly lines = new Graphics();
  private readonly jumar = SuitRig.jumar();

  /** In a suit of `suit`'s colour, with a pack `pack` times a client's: a Sherpa's is bigger; its
   * rim of light `rim` wider than it all round. */
  constructor(suit: number, pack: number, rim: number) {
    super();
    this.drawRim(rim, pack);
    this.drawBack(pack);
    this.drawLegs(suit);
    this.drawChest(suit);
    this.drawArms(suit);
    this.drawHead(suit);
    this.drawMask();
    this.hoseOn = FrontRig.hose(FrontRig.SHAPES.hose(pack, true));
    this.hoseOff = FrontRig.hose(FrontRig.SHAPES.hose(pack, false));
    this.torso.addChild(this.chest);
    this.addChild(
      this.rim,
      this.back,
      this.legs,
      this.torso,
      this.hangingMask,
      this.arms,
      this.head,
      this.lens,
      this.shine,
      this.hoseOn,
      this.hoseOff,
      this.faceMask,
      this.lines,
      this.jumar,
    );
  }

  /** The figure this frame: the chest `swell` wider with the breath, the mask on the face while
   * the oxygen flows or hanging on the chest, its hose with it, the goggles' lens the sky's
   * colour. */
  place(swell: number, masked: boolean, sky: number): void {
    this.torso.scale.x = 1 + swell;
    this.faceMask.visible = masked;
    this.hoseOn.visible = masked;
    this.hangingMask.visible = !masked;
    this.hoseOff.visible = !masked;
    this.lens.tint = sky;
  }

  /** The rim of the hour's light on the figure's edge on the sun's side, as `ClimberFigure` lights
   * the side figure's: its silhouette in the light's `tint`, `alpha` strong, set behind it
   * `towards` the light, so only that edge shows; none while `shown` is false. */
  light(shown: boolean, tint: number, alpha: number, towards: Joint): void {
    const { rim } = this;
    rim.visible = shown;
    rim.tint = tint;
    rim.alpha = alpha;
    rim.position.set(towards.x, towards.y);
  }

  /** The cowstails, `width` wide: from the harness to each carabiner on its rope, in the figure's
   * metres, the jumar's and the second's, or hanging by a thigh where one's off; the jumar at the
   * end of the first. */
  hold(jumar: Joint | null, carabiner: Joint | null, width: number): void {
    const { lines } = this;
    const { HANGING } = FrontRig;
    const { tie } = FrontRig.SHAPES;
    lines.clear();
    const ends: Joint[] = [];
    for (const [to, side] of [
      [jumar, -1],
      [carabiner, 1],
    ] as const) {
      const end = to ?? { x: tie.x + side * HANGING.aside, y: tie.y - HANGING.down };
      const sag = to === null ? 0.06 : 0.1;
      lines
        .moveTo(tie.x, tie.y)
        .quadraticCurveTo((tie.x + end.x) / 2, Math.min(tie.y, end.y) - sag, end.x, end.y)
        .stroke({ width, color: Palette.SLING, cap: "round" });
      ends.push(end);
    }
    const [first, second] = ends;
    if (second !== undefined) {
      lines
        .poly(FrontRig.flat(FrontRig.carabiner(tie, second)))
        .stroke({ width: width * 0.8, color: Palette.STEEL, join: "round" });
    }
    if (first !== undefined) {
      this.jumar.position.set(first.x, first.y);
      this.jumar.rotation = Math.atan2(first.y - tie.y, first.x - tie.x);
    }
  }

  /** The figure's silhouette, drawn white and `width` wider all round, to be tinted the hour's
   * light: the pack, a Sherpa's bigger, the legs and boots, the body, the arms and the hood. */
  private drawRim(width: number, pack: number): void {
    const { rim } = this;
    const { pack: bag, legs, torso, arms, collar, head, standing } = FrontRig.SHAPES;
    const fill = (part: Outline, scale = 1, up = 0): void => {
      rim
        .poly(part.flatMap(({ x, y }) => [x * scale, up + y * scale]))
        .fill(0xffffff)
        .stroke({ width, color: 0xffffff, join: "round" });
    };
    for (const part of [bag.body, bag.lid, bag.bottle, bag.regulator]) {
      fill(part, pack, standing.pelvis.y);
    }
    for (const { thigh, shin, gaiter, boot } of legs) {
      for (const part of [thigh.outline, shin.outline, gaiter, boot.shell, ...boot.crampon]) {
        fill(part);
      }
    }
    fill(torso.outline);
    for (const { upper, forearm, mitt, gauntlet } of arms) {
      for (const part of [upper.outline, forearm.outline, mitt, gauntlet]) {
        fill(part);
      }
    }
    fill(collar);
    fill(head.hood);
  }

  /** The pack behind the body, from the pelvis, bigger for a Sherpa's load: its lid over the
   * shoulders, and the oxygen's bottle standing in it, its top and the regulator over the left
   * shoulder, where the hose comes from. */
  private drawBack(pack: number): void {
    const { back } = this;
    const { body, lid, bottle, regulator, dial } = FrontRig.SHAPES.pack;
    back
      .poly(FrontRig.flat(body))
      .fill(FrontRig.PAINT.of(Palette.PACK, "side"))
      .poly(FrontRig.flat(bottle))
      .fill(FrontRig.PAINT.of(Palette.BOTTLE, "side"))
      .poly(FrontRig.flat(lid))
      .fill(FrontRig.PAINT.of(Palette.PACK_LID, "side"))
      .poly(FrontRig.flat(regulator))
      .fill(FrontRig.PAINT.of(Palette.REGULATOR, "above"))
      .poly(FrontRig.flat(dial))
      .fill(FrontRig.PAINT.of(Palette.REGULATOR, "above"))
      .stroke({ width: 0.004, color: Palette.HOSE });
    back.position.set(0, FrontRig.SHAPES.standing.pelvis.y);
    back.scale.set(pack);
  }

  /** The legs a little apart in their down, each as the side figure has it from the front, and the
   * body's shade over the tops of the thighs. */
  private drawLegs(suit: number): void {
    const { legs } = this;
    for (const leg of FrontRig.SHAPES.legs) {
      this.drawLeg(leg, suit);
    }
    legs
      .poly(FrontRig.flat(FrontRig.moved(FrontRig.SHAPES.torso.outline, { x: 0, y: -0.014 })))
      .fill({ color: 0x000000, alpha: 0.22 });
  }

  /** A leg: the thigh, quilted; the shin over it at the knee, which comes towards the viewer, the
   * crease there, and its dark panel down to the boot; the gaiter, its collar and zip; and the
   * boot. */
  private drawLeg(leg: FrontLeg, suit: number): void {
    const { legs } = this;
    FrontRig.quilt(legs, leg.thigh, suit);
    FrontRig.quilt(legs, leg.shin, suit);
    legs
      .poly(FrontRig.flat(leg.knee), false)
      .stroke({ width: 0.01, color: Palette.SEAM, alpha: 0.3, cap: "round" })
      .poly(FrontRig.flat(FrontRig.moved(leg.knee, { x: 0, y: -0.008 })), false)
      .stroke({ width: 0.006, color: 0xffffff, alpha: 0.1, cap: "round" });
    legs
      .poly(FrontRig.flat(leg.panel))
      .fill(FrontRig.PAINT.of(Palette.PANEL, "side"))
      .poly(FrontRig.flat(leg.gaiter))
      .fill(FrontRig.PAINT.of(Palette.BOOTS, "side"))
      .poly(FrontRig.flat(leg.collar))
      .fill(FrontRig.PAINT.of(Palette.RAND, "side"))
      .poly(FrontRig.flat(leg.zip), false)
      .stroke({ width: 0.008, color: Palette.RAND, cap: "round" });
    FrontRig.boot(legs, leg.boot);
  }

  /** A boot from the front: the shell lit from the right and above, the light on its toe box, the
   * rand round its sole and the cap over its toe, the crampon's points and frame under it and its
   * bail over the toe cap. */
  private static boot(on: Graphics, boot: FrontBoot): void {
    for (const piece of boot.crampon) {
      on.poly(FrontRig.flat(piece)).fill(FrontRig.PAINT.of(Palette.STEEL, "side"));
    }
    on.poly(FrontRig.flat(boot.shell))
      .fill(FrontRig.PAINT.of(Palette.BOOTS, "side"))
      .poly(FrontRig.flat(boot.instep))
      .fill(FrontRig.glow())
      .poly(FrontRig.flat(boot.rand))
      .fill(FrontRig.PAINT.of(Palette.RAND, "side"))
      .poly(FrontRig.flat(boot.toe))
      .fill(FrontRig.PAINT.of(Palette.RAND, "above"))
      .poly(FrontRig.flat(boot.bail), false)
      .stroke({ width: 0.007, color: Palette.STEEL, cap: "round" });
  }

  /** The body, quilted, its dark yoke over the shoulders and the main zip up the middle, shaded
   * where the arms hang against it; the harness round the waist; and the pack's straps down the
   * chest. It swells with the breath. */
  private drawChest(suit: number): void {
    const { chest } = this;
    const { torso, yoke, zip, arms } = FrontRig.SHAPES;
    FrontRig.quilt(chest, torso, suit);
    chest.poly(FrontRig.flat(yoke)).fill(FrontRig.PAINT.of(Palette.PANEL, "side"));
    // Where each arm hangs against the body, the body is in its shade.
    for (const { shade } of arms) {
      const right = (shade[0]?.x ?? 0) > 0;
      chest.poly(FrontRig.flat(shade)).fill(FrontRig.fade(right ? "right" : "left"));
    }
    chest
      .poly(FrontRig.flat(zip), false)
      .stroke({ width: 0.016, color: Palette.SEAM, alpha: 0.22 })
      .poly(FrontRig.flat(zip), false)
      .stroke({ width: 0.005, color: Palette.SEAM, alpha: 0.6 })
      .poly(FrontRig.flat(FrontRig.moved(zip, { x: 0.006, y: 0 })), false)
      .stroke({ width: 0.003, color: 0xffffff, alpha: 0.14 });
    this.drawHarness();
    this.drawStraps();
  }

  /** The harness: the leg loops round the tops of the thighs, the belt, its buckle and the slot
   * through it, the belay loop the cowstails tie into, and a gear loop at each hip with a carabiner
   * on it. */
  private drawHarness(): void {
    const { chest } = this;
    const { belt, buckle, slot, belay, gearLoops, carabiners } = FrontRig.SHAPES.harness;
    for (const { loop } of FrontRig.SHAPES.legs) {
      FrontRig.dropped(chest, loop);
      chest.poly(FrontRig.flat(loop)).fill(FrontRig.PAINT.of(Palette.HARNESS, "side"));
      FrontRig.edged(chest, loop);
    }
    chest
      .poly(FrontRig.flat(FrontRig.moved(belt, { x: 0, y: -0.008 })))
      .fill({ color: 0x000000, alpha: FrontRig.DROP_ALPHA })
      .poly(FrontRig.flat(belt))
      .fill(FrontRig.PAINT.of(Palette.HARNESS, "side"));
    FrontRig.edged(chest, belt);
    for (const loop of [belay, ...gearLoops]) {
      chest
        .poly(FrontRig.flat(FrontRig.moved(loop, FrontRig.DROP)), false)
        .stroke({ width: 0.014, color: 0x000000, alpha: FrontRig.DROP_ALPHA, cap: "round" })
        .poly(FrontRig.flat(loop), false)
        .stroke({
          width: loop === belay ? 0.016 : 0.009,
          color: Palette.HARNESS,
          cap: "round",
          join: "round",
        });
    }
    for (const carabiner of carabiners) {
      chest
        .poly(FrontRig.flat(carabiner))
        .stroke({ width: 0.006, color: Palette.STEEL, join: "round" });
    }
    FrontRig.dropped(chest, buckle);
    chest
      .poly(FrontRig.flat(buckle))
      .fill(FrontRig.PAINT.of(Palette.STEEL, "above"))
      .poly(FrontRig.flat(slot))
      .fill(Palette.HARNESS);
  }

  /** The pack's shoulder straps over the yoke and down the chest, the webbing round under the
   * arms, and the chest strap across them with its buckle, each shading what it lies on. */
  private drawStraps(): void {
    const { chest } = this;
    const { pads, webbing, chest: across, buckle } = FrontRig.SHAPES.straps;
    for (const strap of [...webbing, across]) {
      FrontRig.dropped(chest, strap);
      chest.poly(FrontRig.flat(strap)).fill(FrontRig.PAINT.of(Palette.STRAP, "side"));
    }
    for (const pad of pads) {
      FrontRig.dropped(chest, pad);
      chest.poly(FrontRig.flat(pad)).fill(FrontRig.PAINT.of(Palette.STRAP, "side"));
      FrontRig.edged(chest, pad);
    }
    FrontRig.dropped(chest, buckle);
    chest.poly(FrontRig.flat(buckle)).fill(FrontRig.PAINT.of(Palette.HARNESS, "above"));
    FrontRig.edged(chest, buckle);
  }

  /** The arms hanging at the sides in their down, a little out from the body, the elbows coming
   * towards the viewer: each upper arm, the forearm over it, the cuff, the mitt, its thumb, and its
   * gauntlet over the cuff. */
  private drawArms(suit: number): void {
    const { arms } = this;
    for (const arm of FrontRig.SHAPES.arms) {
      FrontRig.quilt(arms, arm.upper, suit);
      FrontRig.quilt(arms, arm.forearm, suit);
      arms
        .poly(FrontRig.flat(arm.cuff))
        .fill(FrontRig.PAINT.of(Palette.shaded(suit, 0.45), "side"))
        .poly(FrontRig.flat(arm.mitt))
        .fill(FrontRig.PAINT.of(Palette.MITTS, "above"))
        .poly(FrontRig.flat(arm.thumb))
        .fill(FrontRig.PAINT.of(Palette.MITTS, "side"))
        .stroke({ width: 0.004, color: 0x000000, alpha: 0.5 })
        .poly(FrontRig.flat(arm.gauntlet))
        .fill(FrontRig.PAINT.of(Palette.MITTS, "side"));
      FrontRig.edged(arms, arm.gauntlet);
      // The light on the mitt's back, over its knuckles.
      FrontRig.sheen(arms, arm.mitt);
    }
  }

  /** The head: the collar under the hood, in the hood's shade; the hood, its puffed rim round the
   * face and the opening dark under the brim; the face; the goggles, their straps round the hood,
   * the lens, drawn white for the sky's tint, and its glints; the headlamp's strap, its case on the
   * brim and its lamp. */
  private drawHead(suit: number): void {
    const { head, lens, shine } = this;
    const { collar, zip, standing } = FrontRig.SHAPES;
    const shapes = FrontRig.SHAPES.head;
    const middle = standing.head.y;
    const chin = Math.min(...shapes.hood.map(({ y }) => y));
    const top = zip[zip.length - 1] ?? { x: 0, y: chin };
    head
      .poly(FrontRig.flat(collar))
      .fill(FrontRig.PAINT.of(suit, "side"))
      .moveTo(top.x, top.y - 0.07)
      .lineTo(top.x, top.y)
      .stroke({ width: 0.005, color: Palette.SEAM, alpha: 0.6 })
      .roundRect(top.x - 0.006, chin - 0.034, 0.012, 0.024, 0.004)
      .fill(FrontRig.PAINT.of(Palette.STEEL, "above"))
      // The hood's shade on the collar under its chin.
      .poly(FrontRig.flat(FigureShapes.band(collar, FigureShapes.UP, chin - 0.03, Infinity)))
      .fill(FrontRig.fade("top"));
    head.poly(FrontRig.flat(shapes.hood)).fill(FrontRig.PAINT.of(suit, "above"));
    for (const seam of shapes.panels) {
      head
        .poly(FrontRig.flat(seam), false)
        .stroke({ width: 0.007, color: Palette.SEAM, alpha: 0.35, cap: "round" });
    }
    head
      .poly(FrontRig.flat(shapes.rim))
      .fill(FrontRig.PAINT.of(KitShading.toned(suit, 1.08), "above"))
      .stroke({ width: 0.008, color: Palette.SEAM, alpha: 0.3 })
      .poly(FrontRig.flat(shapes.opening))
      .fill(FrontRig.depth());
    FrontRig.sheen(head, shapes.rim);
    head
      .poly(FrontRig.flat(shapes.face))
      .fill(FrontRig.skin())
      .ellipse(0, middle - 0.05, 0.014, 0.006)
      .fill({ color: FrontRig.SKIN.shade, alpha: 0.7 })
      .poly(FrontRig.flat(shapes.nose))
      .fill(FrontRig.PAINT.of(FrontRig.SKIN.lit, "side"))
      .poly(FrontRig.flat(shapes.mouth), false)
      .stroke({ width: 0.006, color: FrontRig.SKIN.shade, cap: "round" });
    // The brim's shade over the top of the face.
    head
      .poly(FrontRig.flat(FigureShapes.band(shapes.opening, FigureShapes.UP, middle, Infinity)))
      .fill({ color: 0x000000, alpha: 0.35 });
    for (const strap of shapes.goggleStraps) {
      head.poly(FrontRig.flat(strap)).fill(FrontRig.PAINT.of(Palette.STRAP, "side"));
    }
    FrontRig.dropped(head, shapes.goggles);
    head.poly(FrontRig.flat(shapes.goggles)).fill(FrontRig.PAINT.of(Palette.GOGGLES, "above"));
    FrontRig.edged(head, shapes.goggles);
    lens.poly(FrontRig.flat(shapes.lens)).fill(FrontRig.PAINT.of(0xffffff, "above"));
    for (const glint of shapes.glints) {
      shine.poly(FrontRig.flat(glint)).fill({ color: 0xffffff, alpha: 0.55 });
    }
    for (const strap of shapes.lampStraps) {
      shine.poly(FrontRig.flat(strap)).fill(FrontRig.PAINT.of(Palette.STRAP, "side"));
      FrontRig.edged(shine, strap);
    }
    const { LAMP } = FrontRig;
    FrontRig.dropped(shine, shapes.lampCase);
    shine
      .poly(FrontRig.flat(shapes.lampCase))
      .fill(FrontRig.PAINT.of(Palette.LAMP_CASE, "above"))
      .circle(LAMP.x, LAMP.y, 0.019)
      .fill(Palette.HOSE)
      .circle(LAMP.x, LAMP.y, 0.0145)
      .fill(Palette.LAMP)
      .circle(LAMP.x + 0.005, LAMP.y + 0.005, 0.004)
      .fill({ color: 0xffffff, alpha: 0.9 });
    FrontRig.edged(shine, shapes.lampCase);
  }

  /** The oxygen mask over the mouth and nose, its valve in front; and off the face, hanging on
   * the chest from its strap round the neck, its valve below. */
  private drawMask(): void {
    const { faceMask, hangingMask } = this;
    const { on, valve, hanging, hangingValve, straps } = FrontRig.SHAPES.mask;
    FrontRig.dropped(faceMask, on);
    faceMask.poly(FrontRig.flat(on)).fill(FrontRig.PAINT.of(Palette.MASK, "above"));
    FrontRig.edged(faceMask, on);
    FrontRig.valve(faceMask, valve, 0.024);
    for (const strap of straps) {
      hangingMask.poly(FrontRig.flat(strap)).fill(Palette.STRAP);
    }
    FrontRig.dropped(hangingMask, hanging);
    hangingMask.poly(FrontRig.flat(hanging)).fill(FrontRig.PAINT.of(Palette.MASK, "above"));
    FrontRig.edged(hangingMask, hanging);
    FrontRig.valve(hangingMask, hangingValve, 0.02);
  }

  /** The oxygen's hose along `line`: shading what it lies on, its rubber and the shine along its
   * ribs. */
  private static hose(line: Outline): Graphics {
    const { HOSE, DROP, DROP_ALPHA } = FrontRig;
    return new Graphics()
      .poly(FrontRig.flat(FrontRig.moved(line, DROP)), false)
      .stroke({ width: HOSE.width, color: 0x000000, alpha: DROP_ALPHA, cap: "round" })
      .poly(FrontRig.flat(line), false)
      .stroke({ width: HOSE.width, color: Palette.HOSE, cap: "round", join: "round" })
      .poly(FrontRig.flat(FrontRig.moved(line, { x: 0.004, y: 0.003 })), false)
      .stroke({ width: HOSE.shine, color: 0xffffff, alpha: 0.18, cap: "round", join: "round" });
  }

  /** A valve on the mask, round `at`: its housing, shading the mask under it, its grey rim, the
   * dark port in it with the light on its lip, and the light on the rim. */
  private static valve(on: Graphics, at: Joint, radius: number): void {
    const { DROP, DROP_ALPHA } = FrontRig;
    on.circle(at.x + DROP.x, at.y + DROP.y, radius)
      .fill({ color: 0x000000, alpha: DROP_ALPHA })
      .circle(at.x, at.y, radius)
      .fill(FrontRig.PAINT.of(Palette.VALVE, "above"))
      .stroke({ width: 0.003, color: 0xffffff, alpha: 0.18 })
      .circle(at.x, at.y, radius * 0.58)
      .fill(FrontRig.PAINT.of(Palette.MASK, "side"))
      .circle(at.x, at.y, radius * 0.3)
      .fill(Palette.HOOD_SHADOW)
      .circle(at.x + radius * 0.42, at.y + radius * 0.48, radius * 0.18)
      .fill({ color: 0xffffff, alpha: 0.45 });
  }

  /** A part of the suit in its down, `suit`'s colour, lit from the right: each baffle puffed
   * between its seams, darker at them and lit over its top, and the seams. */
  private static quilt(on: Graphics, part: Quilted, suit: number): void {
    const { outline, along, seams } = part;
    on.poly(FrontRig.flat(outline)).fill(FrontRig.PAINT.of(suit, "side"));
    const ends = [-Infinity, ...seams, Infinity];
    for (let index = 1; index < ends.length; index += 1) {
      const baffle = FigureShapes.band(
        outline,
        along,
        ends[index - 1] ?? -Infinity,
        ends[index] ?? Infinity,
      );
      // Up a part, its baffles' tops are towards the light; down one, their tops are the ends
      // nearer its root.
      on.poly(FrontRig.flat(baffle)).fill(FrontRig.puff(along.y > 0 ? "up" : "down"));
    }
    const half = KitShading.SEAM.width / 2;
    for (const seam of seams) {
      on.poly(FrontRig.flat(FigureShapes.band(outline, along, seam - half, seam + half))).fill({
        color: Palette.SEAM,
        alpha: KitShading.SEAM.alpha,
      });
    }
  }

  /** What `part` lying on another throws on it: its shape, down to the left, darkened. */
  private static dropped(on: Graphics, part: Outline): void {
    on.poly(FrontRig.flat(FrontRig.moved(part, FrontRig.DROP))).fill({
      color: 0x000000,
      alpha: FrontRig.DROP_ALPHA,
    });
  }

  /** A part's edge towards the light, a faint line, so it reads on what's as dark round it: the
   * longest run of its outline, which goes round it anticlockwise, facing up and to the right. */
  private static edged(on: Graphics, part: Outline): void {
    const { width, alpha } = FrontRig.EDGE;
    const count = part.length;
    const corner = (index: number): Joint => part[index % count] ?? { x: 0, y: 0 };
    // Anticlockwise, an edge's outward side is its way turned a quarter clockwise.
    const lit = (index: number): boolean => {
      const [from, to] = [corner(index), corner(index + 1)];
      return (to.y - from.y) * 0.6 + (from.x - to.x) * 0.8 > 0;
    };
    const start = Array.from({ length: count }, (_, index) => index).find((index) => !lit(index));
    if (start === undefined) {
      return;
    }
    // From an edge in the shade round to it again, so no run of lit edges is cut in two.
    let best: Joint[] = [];
    let run: Joint[] = [];
    for (let index = start + 1; index <= start + count; index += 1) {
      if (lit(index)) {
        run = run.length === 0 ? [corner(index), corner(index + 1)] : [...run, corner(index + 1)];
      } else {
        best = run.length > best.length ? run : best;
        run = [];
      }
    }
    if (best.length > 1) {
      on.poly(FrontRig.flat(best), false).stroke({ width, color: 0xffffff, alpha, join: "round" });
    }
  }

  /** The light on a round part's top right, soft. */
  private static sheen(on: Graphics, part: Outline): void {
    const xs = part.map(({ x }) => x);
    const ys = part.map(({ y }) => y);
    const [left, right] = [Math.min(...xs), Math.max(...xs)];
    const [low, high] = [Math.min(...ys), Math.max(...ys)];
    on.ellipse(
      left + (right - left) * 0.64,
      low + (high - low) * 0.68,
      (right - left) * 0.22,
      (high - low) * 0.16,
    ).fill(FrontRig.glow());
  }

  /** A carabiner hanging from `from` at `at`: a ring longer than it's wide, along its sling. */
  private static carabiner(from: Joint, at: Joint): Outline {
    const { across, along } = FrontRig.CARABINER;
    const angle = Math.atan2(at.y - from.y, at.x - from.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const middle = { x: at.x + cos * along, y: at.y + sin * along };
    return FigureShapes.ellipse({ x: 0, y: 0 }, along, across).map(({ x, y }) => ({
      x: middle.x + x * cos - y * sin,
      y: middle.y + x * sin + y * cos,
    }));
  }

  /** The puff over a baffle of down: dark at its seams, lit over its top, towards the light; its
   * top up the part's way, `up`, or down it. */
  private static puff(way: "up" | "down"): FillGradient {
    return FrontRig.PAINT.once(`front puff ${way}`, () => {
      const stops: readonly (readonly [number, number, number])[] = [
        [0, 0x000000, 0.26],
        [0.2, 0x000000, 0.06],
        [0.45, 0x000000, 0],
        [0.7, 0xffffff, 0.1],
        [0.86, 0xffffff, 0.03],
        [1, 0x000000, 0.16],
      ];
      return new FillGradient({
        type: "linear",
        start: { x: 0.5, y: way === "up" ? 0 : 1 },
        end: { x: 0.5, y: way === "up" ? 1 : 0 },
        colorStops: stops.map(([offset, colour, alpha]) => ({
          offset,
          color: Palette.css(colour, alpha),
        })),
        textureSpace: "local",
      });
    });
  }

  /** A shade fading out across a band: darkest on its `dark` side. */
  private static fade(dark: "left" | "right" | "top"): FillGradient {
    return FrontRig.PAINT.once(`front fade ${dark}`, () => {
      const start =
        dark === "left" ? { x: 0, y: 0.5 } : dark === "right" ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 };
      return new FillGradient({
        type: "linear",
        start,
        end: { x: 1 - start.x, y: 1 - start.y },
        colorStops: [
          { offset: 0, color: Palette.css(0x000000, 0.32) },
          { offset: 1, color: Palette.css(0x000000, 0) },
        ],
        textureSpace: "local",
      });
    });
  }

  /** The hood's opening: dark, darkest under the brim. */
  private static depth(): FillGradient {
    return FrontRig.PAINT.once("front depth", () => {
      const shadow = Palette.HOOD_SHADOW;
      return new FillGradient({
        type: "linear",
        start: { x: 0.5, y: 0 },
        end: { x: 0.5, y: 1 },
        colorStops: [
          { offset: 0, color: Palette.css(KitShading.toned(shadow, 2.2)) },
          { offset: 0.6, color: Palette.css(shadow) },
          { offset: 1, color: Palette.css(0x000000) },
        ],
        textureSpace: "local",
      });
    });
  }

  /** The face in the hood's shade: lit in the middle, under the light, darker to its edges. */
  private static skin(): FillGradient {
    return FrontRig.PAINT.once("front skin", () => {
      const { lit, shade } = FrontRig.SKIN;
      return new FillGradient({
        type: "radial",
        center: { x: 0.6, y: 0.35 },
        innerRadius: 0,
        outerCenter: { x: 0.55, y: 0.4 },
        outerRadius: 0.62,
        colorStops: [
          { offset: 0, color: Palette.css(lit) },
          { offset: 0.55, color: Palette.css(Palette.mix(lit, shade, 0.45)) },
          { offset: 1, color: Palette.css(shade) },
        ],
        textureSpace: "local",
      });
    });
  }

  /** A soft light, bright in its middle and gone at its edge. */
  private static glow(): FillGradient {
    return FrontRig.PAINT.once("front glow", () => {
      return new FillGradient({
        type: "radial",
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.5,
        colorStops: [
          { offset: 0, color: Palette.css(0xffffff, 0.16) },
          { offset: 1, color: Palette.css(0xffffff, 0) },
        ],
        textureSpace: "local",
      });
    });
  }

  /** An outline moved by `by`. */
  private static moved(outline: Outline, by: Joint): Outline {
    return outline.map(({ x, y }) => ({ x: x + by.x, y: y + by.y }));
  }

  /** An outline's corners as the numbers Pixi draws. */
  private static flat(outline: Outline): number[] {
    return outline.flatMap(({ x, y }) => [x, y]);
  }
}
