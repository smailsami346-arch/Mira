import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/store";
import { makeFinding } from "@/lib/heuristics/types";
import { guard } from "@/lib/api/ratelimit";
import type { FindingLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const repo = getRepo();
  if (!repo.getInvestigation(params.id)) {
    return NextResponse.json({ error: "investigation_not_found" }, { status: 404 });
  }
  return NextResponse.json({ findings: repo.listFindings(params.id) });
}

// Analyst-created finding (manual note attached to an investigation).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rl = guard(req);
  if (rl) return rl;
  const repo = getRepo();
  if (!repo.getInvestigation(params.id)) {
    return NextResponse.json({ error: "investigation_not_found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const level: FindingLevel = ["FACT", "INFERENCE", "HYPOTHESIS"].includes(body?.level) ? body.level : "HYPOTHESIS";
  const finding = makeFinding({
    investigation_id: params.id,
    level,
    title: String(body?.title ?? "Manual note"),
    description: String(body?.description ?? ""),
    evidence: Array.isArray(body?.evidence) ? body.evidence : [],
    confidence_score: Math.max(0, Math.min(100, Number(body?.confidence_score) || 50)),
    reasoning_summary: String(body?.reasoning_summary ?? ""),
    data_sources: Array.isArray(body?.data_sources) ? body.data_sources : ["manual"],
  });
  repo.addFindings([finding]);
  return NextResponse.json(finding, { status: 201 });
}
