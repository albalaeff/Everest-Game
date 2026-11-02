// Temporary: everything core-purity.test.ts must refuse, for CI to go red on it.
import "pixi.js";
import "./../../agents/sherpa";
import "../testing/test-slope";

export class Violation {
  readonly drawn = Math.random();
  readonly now = Date.now();
  readonly rounded = Math.pow(2, 0.5);
  readonly square = 2 ** 2;
  readonly order = "a".localeCompare("b");
}
