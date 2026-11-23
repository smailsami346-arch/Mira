import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { seedDemo } from "@/lib/db/seed";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = guard(req);
  if (rl) return rl;
  return NextResponse.json(seedDemo(getRepo()));
}
