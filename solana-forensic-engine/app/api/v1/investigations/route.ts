import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = guard(req);
  if (rl) return rl;
  return NextResponse.json({ investigations: getRepo().listInvestigations() });
}

// POST { "token_mint": "...", "created_by": "analyst" }
export async function POST(req: Request) {
  const rl = guard(req);
  if (rl) return rl;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.token_mint !== "string") {
    return NextResponse.json({ error: "token_mint_required" }, { status: 400 });
  }
  const inv = getRepo().createInvestigation(body.token_mint, body?.created_by ?? "api");
  return NextResponse.json(inv, { status: 201 });
}
