import { describe, expect, it } from "vitest";

import {
  retryState,
  transformIdentity,
} from "./transforms";

describe("transform lineage", () => {
  it("is stable for the same source and versioned specification", () => {
    const checksum = "a".repeat(64);
    expect(transformIdentity(checksum)).toBe(transformIdentity(checksum));
    expect(transformIdentity(checksum)).not.toBe(
      transformIdentity(checksum, "review-v2", 2),
    );
  });

  it("quarantines poison jobs after the third lease", () => {
    expect(retryState(1)).toBe("queued");
    expect(retryState(2)).toBe("queued");
    expect(retryState(3)).toBe("quarantined");
  });
});
