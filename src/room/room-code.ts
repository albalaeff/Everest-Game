/**
 * A room's code, as players type it and links carry it: five letters and digits without the
 * look-alikes, no O and 0, no I and 1, in any case. A value: a change makes a new one.
 */
export class RoomCode {
  static readonly LENGTH = 5;
  /** 32 characters, so a byte's low five bits pick one and every character comes as often. */
  static readonly ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  private static readonly SHAPE = /^[A-HJ-NP-Z2-9]{5}$/;

  private constructor(readonly text: string) {}

  /** The code a player typed or a link carried, in any case and with spaces around it; null when
   * it's no code. */
  static parse(typed: string): RoomCode | null {
    const text = typed.trim().toUpperCase();
    return RoomCode.SHAPE.test(text) ? new RoomCode(text) : null;
  }

  /** A new code from random bytes, as `crypto.getRandomValues` fills them: one a character. */
  static drawn(bytes: Uint8Array): RoomCode {
    if (bytes.length < RoomCode.LENGTH) {
      throw new RangeError(
        `A room code needs ${RoomCode.LENGTH} random bytes, not ${bytes.length}`,
      );
    }
    const text = [...bytes.subarray(0, RoomCode.LENGTH)]
      .map((byte) => RoomCode.ALPHABET[byte % RoomCode.ALPHABET.length] ?? "")
      .join("");
    return new RoomCode(text);
  }

  toString(): string {
    return this.text;
  }
}
