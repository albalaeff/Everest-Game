import { describe, expect, it } from "vitest";

import { ExpertReview } from "./expert-review";

describe("ExpertReview", () => {
  it("isn't done while one record is still source only", () => {
    const review = new ExpertReview([
      { facts: [{ status: "expert-reviewed" }] },
      { facts: [{ status: "expert-reviewed" }, { status: "source only" }] },
    ]);

    expect(review.done()).toBe(false);
  });

  it("isn't done while a question for an expert is open", () => {
    const review = new ExpertReview([{ facts: [{ status: "expert-reviewed" }, {}] }]);

    expect(review.done()).toBe(false);
  });

  it("is done once every record is expert-reviewed", () => {
    const review = new ExpertReview([
      { facts: [{ status: "expert-reviewed" }] },
      { facts: [{ status: "expert-reviewed" }, { status: "expert-reviewed" }] },
    ]);

    expect(review.done()).toBe(true);
  });
});
