import { beforeEach, describe, expect, it } from "vitest";

import { operationsAuthorized } from "./operations-auth";

beforeEach(() => {
  process.env.OPERATIONS_SECRET = "operations-test-secret";
});

describe("operations authentication", () => {
  it("uses an exact constant-time secret boundary", () => {
    expect(
      operationsAuthorized(
        new Request("https://example.test", {
          headers: { "x-operations-secret": "operations-test-secret" },
        }),
      ),
    ).toBe(true);
    expect(
      operationsAuthorized(
        new Request("https://example.test", {
          headers: { "x-operations-secret": "wrong" },
        }),
      ),
    ).toBe(false);
  });
});
