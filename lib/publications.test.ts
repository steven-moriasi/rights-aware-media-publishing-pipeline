import { describe, expect, it } from "vitest";

import { sandboxOutcomeState } from "./publications";

describe("sandbox publication outcomes", () => {
  it("preserves timeout ambiguity for reconciliation", () => {
    expect(sandboxOutcomeState("unknown")).toBe("unknown");
    expect(sandboxOutcomeState("delivered")).toBe("delivered");
    expect(sandboxOutcomeState("rejected")).toBe("blocked");
  });
});
