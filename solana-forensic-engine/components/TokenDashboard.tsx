"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import type { ClusterRecord, Finding, NormalizedEvent } from "@/lib/types";

const LEVEL_COLORS: Record<string, string> = {
  FACT: "#22c55e",
  INFERENCE: "#eab308",
  HYPOTHESIS: "#ef4444",
};

function LevelBadge({ level, lang }: { level: string; lang: Lang }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-bold text-black"
      style={{ backgroundColor: LEVEL_COLORS[level] ?? "#6b7280" }}
    >
      {t(lang, level)}
    </span>
  );
}

function RiskGauge({ value }: { value: number }) {
  const r = 52;
  const c = Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 70 ? "#ef4444" : value >= 40 ? "#eab308" : "#22c55e";
  return (
    <svg width="140" height="84" viewBox="0 0 140 84">
      <path d="M 12 76 A 52 52 0 0 1 128 76" fill="none" stroke="#1f2a3a" strokeWidth="12" />
      <path
        d="M 12 76 A 52 52 0 0 1 128 76"
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text x="70" y="70" textAnchor="middle" fill="#e5e7eb" fontSize="22" fontWeight="bold">
        {value}
      </text>
    </svg>
  );
}

function short(s: string | null): string {
  return s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—";
}

export default function TokenDashboard({ mint }: { mint: string }) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("ar");
  const [summary, setSummary] = useState<any>(null);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [clusters, setClusters] = useState<ClusterRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, e, c] = await Promise.all([
          fetch(`/api/v1/tokens/${mint}`).then((r) => r.json()),
          fetch(`/api/v1/tokens/${mint}/events?limit=50`).then((r) => r.json()),
          fetch(`/api/v1/tokens/${mint}/clusters`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (s.error) setError(s.error);
        else setSummary(s);
        setEvents(e.events ?? []);
        setClusters(c.clusters ?? []);
      } catch {
        if (!cancelled) setError("network");
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [mint]);

  const toggleLang = () => {
    const next: Lang = lang === "ar" ? "en" : "ar";
    setLang(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push("/")} className="panel px-3 py-1 text-sm text-gray-300 hover:text-white">
          ← {t(lang, "back")}
        </button>
        <button onClick={toggleLang} className="panel px-3 py-1 text-sm text-gray-300 hover:text-white">
          {t(lang, "lang")}
        </button>
      </div>

      {error && <div className="panel p-4 text-red-400">{t(lang, "failedLoad")}: {error}</div>}
      {!summary && !error && <div className="panel p-6 text-gray-400">{t(lang, "loading")}</div>}

      {summary && (
        <>
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">
                  {summary.symbol ?? "—"} <span className="mono text-sm text-gray-400">{short(summary.mint)}</span>
                </h1>
                <div className="mt-2 text-sm text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span>{t(lang, "deployer")}: <span className="mono">{short(summary.deployer)}</span></span>
                  <span>{t(lang, "launchpad")}: {summary.launchpad}</span>
                  <span>{t(lang, "supply")}: {summary.supply}</span>
                  <span>{t(lang, "phase")}: <b>{summary.phase}</b></span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <RiskGauge value={summary.risk_score ?? 0} />
                <span className="text-xs text-gray-400">{t(lang, "riskScore")}</span>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <section className="panel p-5">
              <h2 className="text-lg font-bold mb-3">{t(lang, "findings")} ({summary.findings_count ?? 0})</h2>
              {(summary.top_findings ?? []).length === 0 && <p className="text-gray-500 text-sm">{t(lang, "noFindings")}</p>}
              <ul className="flex flex-col gap-3">
                {(summary.top_findings ?? []).map((f: Finding) => (
                  <li key={f.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <LevelBadge level={f.level} lang={lang} />
                      <span className="font-semibold text-sm">{f.title}</span>
                      <span className="text-xs text-gray-400 ms-auto">{t(lang, "confidence")}: {f.confidence_score}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{f.reasoning_summary}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {f.evidence.slice(0, 4).map((ev, i) =>
                        ev.explorer_url ? (
                          <a key={i} href={ev.explorer_url} target="_blank" rel="noreferrer"
                            className="text-xs text-indigo-400 underline mono ltr-only">
                            {ev.value.slice(0, 8)}… {t(lang, "openExplorer")}
                          </a>
                        ) : (
                          <span key={i} className="text-xs text-gray-500 mono">{ev.type}: {ev.value}</span>
                        ),
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel p-5">
              <h2 className="text-lg font-bold mb-3">{t(lang, "clusters")}</h2>
              {clusters.length === 0 && <p className="text-gray-500 text-sm">{t(lang, "noClusters")}</p>}
              <ul className="flex flex-col gap-3">
                {clusters.map((c) => (
                  <li key={c.cluster_id} className="border border-border rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{c.heuristic}</span>
                      <span className="text-xs text-gray-400 ms-auto">{t(lang, "confidence")}: {c.confidence}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 mono ltr-only text-left">
                      {c.members.map((m) => m.slice(0, 8) + "…").join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="panel p-5 overflow-x-auto">
            <h2 className="text-lg font-bold mb-3">{t(lang, "events")} ({events.length})</h2>
            {events.length === 0 && <p className="text-gray-500 text-sm">{t(lang, "noEvents")}</p>}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-start">
                  <th className="p-2">{t(lang, "type")}</th>
                  <th className="p-2">{t(lang, "from")}</th>
                  <th className="p-2">{t(lang, "to")}</th>
                  <th className="p-2">{t(lang, "amount")}</th>
                  <th className="p-2">{t(lang, "slot")}</th>
                  <th className="p-2">{t(lang, "time")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={`${e.tx_signature}-${e.event_type}-${e.slot}`} className="border-t border-border">
                    <td className="p-2">{e.event_type}</td>
                    <td className="p-2 mono ltr-only text-left">{short(e.from_wallet)}</td>
                    <td className="p-2 mono ltr-only text-left">{short(e.to_wallet)}</td>
                    <td className="p-2 mono">{e.amount}</td>
                    <td className="p-2 mono">{e.slot}</td>
                    <td className="p-2">{new Date(e.block_time * 1000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
