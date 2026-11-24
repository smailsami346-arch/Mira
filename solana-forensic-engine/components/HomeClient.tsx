"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_MINT } from "@/lib/db/seed";
import { t, type Lang } from "@/lib/i18n";

export default function HomeClient() {
  const router = useRouter();
  const [mint, setMint] = useState("");
  const [lang, setLang] = useState<Lang>("ar");
  const [busy, setBusy] = useState(false);

  const toggleLang = () => {
    const next: Lang = lang === "ar" ? "en" : "ar";
    setLang(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  const loadDemo = async () => {
    setBusy(true);
    try {
      await fetch("/api/v1/demo/seed", { method: "POST" });
      router.push(`/token/${DEMO_MINT}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 pt-16">
      <div className="w-full flex justify-end">
        <button onClick={toggleLang} className="panel px-3 py-1 text-sm text-gray-300 hover:text-white">
          {t(lang, "lang")}
        </button>
      </div>
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-bold">{t(lang, "appTitle")}</h1>
        <p className="mt-3 text-gray-400">{t(lang, "subtitle")}</p>
      </div>
      <div className="w-full max-w-xl flex gap-2">
        <input
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder={t(lang, "searchPlaceholder")}
          className="panel flex-1 px-4 py-3 mono text-sm ltr-only text-left"
          dir="ltr"
        />
        <button
          onClick={() => mint.trim() && router.push(`/token/${mint.trim()}`)}
          className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold"
        >
          {t(lang, "analyze")}
        </button>
      </div>
      <button
        onClick={loadDemo}
        disabled={busy}
        className="px-5 py-3 rounded-xl panel hover:border-indigo-500 text-gray-200"
      >
        {busy ? t(lang, "loading") : t(lang, "loadDemo")}
      </button>
    </div>
  );
}
