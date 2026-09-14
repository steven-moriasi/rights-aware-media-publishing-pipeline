import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/database";
import {
  actorContext,
  requireRole,
} from "@/lib/request-context";
import { createRightsGrant } from "@/lib/rights";

interface RightsBody {
  destination?: string;
  renditionSpecId?: string;
  territory?: string;
  validFrom?: string;
  validUntil?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const context = actorContext(request);
    requireRole(context, ["rights-manager"]);
    const { assetId } = await params;
    const body = (await request.json()) as RightsBody;
    if (
      body.destination === undefined ||
      body.renditionSpecId === undefined ||
      body.territory === undefined ||
      body.validFrom === undefined ||
      body.validUntil === undefined
    ) {
      return NextResponse.json(
        { error: "The rights boundary is incomplete." },
        { status: 400 },
      );
    }
    const grant = await createRightsGrant(
      getDatabase(),
      {
        assetId,
        destination: body.destination,
        renditionSpecId: body.renditionSpecId,
        territory: body.territory,
        validFrom: new Date(body.validFrom),
        validUntil: new Date(body.validUntil),
      },
      context.actorId,
    );
    return NextResponse.json({ grant }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grant failed." },
      { status: 403 },
    );
  }
}
