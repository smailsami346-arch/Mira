import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { guard } from "@/lib/api/ratelimit";

export const dynamic = "force-dynamic";

// GET /api/v1/investigations/:id/export?format=json  (pdf is stubbed in MVP)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "json";
  const repo = getRepo();
  const inv = repo.getInvestigation(params.id);
  if (!inv) return NextResponse.json({ error: "investigation_not_found" }, { status: 404 });
  if (format === "pdf") {
    return NextResponse.json({ error: "pdf_not_implemented_in_mvp" }, { status: 501 });
  }
  return NextResponse.json({
    investigation: inv,
    findings: repo.listFindings(inv.id),
    exported_at: new Date().toISOString(),
  });
}
