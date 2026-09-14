import { beforeEach, describe, expect, it } from "vitest";

import {
  createDeliveryToken,
  verifyDeliveryToken,
} from "./delivery-token";

beforeEach(() => {
  process.env.PUBLICATION_SIGNING_SECRET = "test-signing-secret";
});

describe("delivery tokens", () => {
  it("verifies an unexpired signed publication scope", () => {
    const token = createDeliveryToken(
      "publication-one",
      new Date("2026-06-01T00:05:00Z"),
    );
    expect(
      verifyDeliveryToken(token, new Date("2026-06-01T00:00:00Z"))
        ?.publicationIntentId,
    ).toBe("publication-one");
  });

  it("rejects expiry and tampering", () => {
    const token = createDeliveryToken(
      "publication-one",
      new Date("2026-06-01T00:05:00Z"),
    );
    expect(
      verifyDeliveryToken(token, new Date("2026-06-01T00:05:00Z")),
    ).toBeNull();
    expect(
      verifyDeliveryToken(`${token.slice(0, -1)}x`, new Date("2026-06-01")),
    ).toBeNull();
  });
});
