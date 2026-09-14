import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { requiredEnvironment } from "./database";

interface DeliveryClaims {
  expiresAt: number;
  publicationIntentId: string;
}

function signature(payload: string): string {
  return createHmac(
    "sha256",
    requiredEnvironment("PUBLICATION_SIGNING_SECRET"),
  )
    .update(payload)
    .digest("base64url");
}

export function createDeliveryToken(
  publicationIntentId: string,
  expiresAt: Date,
): string {
  const claims: DeliveryClaims = {
    expiresAt: Math.floor(expiresAt.getTime() / 1_000),
    publicationIntentId,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyDeliveryToken(
  token: string,
  now = new Date(),
): DeliveryClaims | null {
  const [payload, receivedSignature, extra] = token.split(".");
  if (
    payload === undefined ||
    receivedSignature === undefined ||
    extra !== undefined
  ) {
    return null;
  }
  const expectedSignature = signature(payload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    received.byteLength !== expected.byteLength ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }
  let claims: DeliveryClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as DeliveryClaims;
  } catch {
    return null;
  }
  if (
    typeof claims.publicationIntentId !== "string" ||
    typeof claims.expiresAt !== "number" ||
    claims.expiresAt <= Math.floor(now.getTime() / 1_000)
  ) {
    return null;
  }
  return claims;
}
