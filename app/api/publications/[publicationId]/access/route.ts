import { NextResponse } from "next/server";

import { createDeliveryToken } from "@/lib/delivery-token";
import { getDatabase } from "@/lib/database";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["publisher", "operator"]);
    const { publicationId } = await params;
    const [publication] = await getDatabase()`
      select id
      from publication_intents
      where id = ${publicationId}
        and state = 'delivered'
    `;
    if (publication === undefined) {
      return NextResponse.json(
        { error: "Delivered publication is unavailable." },
        { status: 404 },
      );
    }
    const expiresAt = new Date(Date.now() + 5 * 60 * 1_000);
    const token = createDeliveryToken(publicationId, expiresAt);
    return NextResponse.json({
      expiresAt,
      url: `/api/deliveries/${publicationId}/content?token=${token}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Access failed." },
      { status: 403 },
    );
  }
}
