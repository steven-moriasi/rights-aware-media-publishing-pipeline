import { timingSafeEqual } from "node:crypto";

import { requiredEnvironment } from "./database";

export function operationsAuthorized(request: Request): boolean {
  const provided = request.headers.get("x-operations-secret");
  if (provided === null) {
    return false;
  }
  const expected = requiredEnvironment("OPERATIONS_SECRET");
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}
