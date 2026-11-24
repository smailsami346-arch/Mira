import type { Finding } from "../types";

// Additive risk model: FACT +3, INFERENCE up to +18, HYPOTHESIS up to +8 (scaled by confidence).
export function computeRiskScore(findings: Finding[]): number {
  let s = 0;
  for (const f of findings) {
    if (f.level === "FACT") s += 3;
    else if (f.level === "INFERENCE") s += (f.confidence_score / 100) * 18;
    else s += (f.confidence_score / 100) * 8;
  }
  return Math.min(100, Math.round(s));
}
