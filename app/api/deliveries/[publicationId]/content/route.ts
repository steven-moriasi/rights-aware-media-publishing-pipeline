import { NextResponse } from "next/server";

import { verifyDeliveryToken } from "@/lib/delivery-token";
import { getDatabase } from "@/lib/database";
import { getObject } from "@/lib/object-storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  const { publicationId } = await params;
  const token = new URL(request.url).searchParams.get("token");
  const claims = token === null ? null : verifyDeliveryToken(token);
  if (
    claims === null ||
    claims.publicationIntentId !== publicationId
  ) {
    return NextResponse.json({ error: "Signed access is invalid." }, { status: 403 });
  }
  const [delivery] = await getDatabase()<
    Array<{ renditionObjectKey: string }>
  >`
    select delivery_receipts.rendition_object_key
    from delivery_receipts
    join publication_intents
      on publication_intents.id = delivery_receipts.publication_intent_id
    where publication_intents.id = ${publicationId}
      and publication_intents.state = 'delivered'
  `;
  if (delivery === undefined) {
    return NextResponse.json(
      { error: "Delivery is unavailable or revoked." },
      { status: 404 },
    );
  }
  const content = await getObject(delivery.renditionObjectKey);
  return new Response(new Uint8Array(content), {
    headers: {
      "cache-control": "private, no-store",
      "content-type": "application/octet-stream",
    },
  });
}
