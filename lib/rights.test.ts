import { describe, expect, it } from "vitest";

import { evaluateRights } from "./rights";

const baseGrant = {
  destination: "sandbox-cdn",
  renditionSpecId: "review-v1",
  state: "active",
  territory: "GB",
  validFrom: new Date("2026-01-01T00:00:00Z"),
  validUntil: new Date("2027-01-01T00:00:00Z"),
};

describe("rights evaluation", () => {
  it("permits matching territory, rendition, destination, and time", () => {
    expect(
      evaluateRights([baseGrant], {
        destination: "sandbox-cdn",
        now: new Date("2026-06-01T00:00:00Z"),
        renditionSpecId: "review-v1",
        territory: "GB",
      }),
    ).toEqual({ permitted: true, reasonCode: "active_grant" });
  });

  it("denies a territory outside the grant", () => {
    expect(
      evaluateRights([baseGrant], {
        destination: "sandbox-cdn",
        now: new Date("2026-06-01T00:00:00Z"),
        renditionSpecId: "review-v1",
        territory: "US",
      }).reasonCode,
    ).toBe("territory_not_granted");
  });

  it("treats the grant end as exclusive", () => {
    expect(
      evaluateRights([baseGrant], {
        destination: "sandbox-cdn",
        now: baseGrant.validUntil,
        renditionSpecId: "review-v1",
        territory: "GB",
      }).reasonCode,
    ).toBe("grant_expired");
  });
});
