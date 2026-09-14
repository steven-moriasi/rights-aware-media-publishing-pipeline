import { describe, expect, it } from "vitest";

import {
  annotationAllowed,
  decisionAllowed,
} from "./reviews";

describe("review invariants", () => {
  it("separates the requester from the decision maker", () => {
    expect(decisionAllowed("producer-one", "reviewer-one")).toBe(true);
    expect(decisionAllowed("producer-one", "producer-one")).toBe(false);
  });

  it("bounds annotations to the rendition duration", () => {
    expect(annotationAllowed(1_000, 5_000)).toBe(true);
    expect(annotationAllowed(5_001, 5_000)).toBe(false);
    expect(annotationAllowed(-1, 5_000)).toBe(false);
  });
});
