"use client";

import { useCallback, useEffect, useState } from "react";
import { useMobile } from "../MobileContext";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { generateSampleShifts } from "@/app/lib/sampleShifts";
import { SAMPLE_SITES } from "@/app/lib/sampleSites";
import type { Site } from "@/app/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
const now = new Date();
const YEAR = now.getFullYear();
const MONTH = now.getMonth() + 1;
const TODAY = `${YEAR}-${pad(MONTH)}-${pad(now.getDate())}`;

export default function MobileReport() {
  const { currentStaff } = useMobile();
  const [sites, setSites] = useState<Site[]>([]);
  const [location, setLocation] = useState("");
  const [workContent, setWorkContent] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 現場マスタ ＋ 本日の自分のシフトから既定の現場を決める
  const init = useCallback(async () => {
    let siteList: Site[];
    let todayLocation = "";
    if (!isSupabaseConfigured) {
      siteList = SAMPLE_SITES;
      const my = generateSampleShifts(YEAR, MONTH).find(
        (s) => s.date === TODAY && s.staff_id === currentStaff?.id
      );
      todayLocation = my?.location ?? "";
    } else {
      const [siteRes, shiftRes] = await Promise.all([
        supabase.from("sites").select("*").order("name"),
        supabase.from("shifts").select("*").eq("date", TODAY),
      ]);
      siteList = (siteRes.data as Site[]) ?? [];
      const my = ((shiftRes.data as { staff_id: string; location: string | null }[]) ?? []).find(
        (s) => s.staff_id === currentStaff?.id
      );
      todayLocation = my?.location ?? "";
    }
    setSites(siteList);
    setLocation((prev) => prev || todayLocation);
  }, [currentStaff]);

  useEffect(() => {
    init();
  }, [init]);

  const polish = async () => {
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_content: workContent,
          special_notes: specialNotes,
          location,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "AI整形に失敗しました。");
        return;
      }
      setAiSummary(data.summary as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setPolishing(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!location) {
      setError("現場を選択してください。");
      return;
    }
    setSaving(true);
    const record = {
      staff_id: currentStaff?.id ?? null,
      date: TODAY,
      location,
      work_content: workContent.trim() || null,
      special_notes: specialNotes.trim() || null,
      ai_summary: aiSummary.trim() || null,
      status: "未確認" as const,
    };
    try {
      if (isSupabaseConfigured) {
        const { error: e } = await supabase.from("reports").insert(record);
        if (e) throw new Error(e.message);
      }
      // デモモードは画面上のみ（保存はされない）
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました。");
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4 pt-10 text-center">
        <div className="text-5xl">✅</div>
        <h1 className="text-xl font-bold text-slate-800">日報を送信しました</h1>
        <p className="text-sm text-slate-500">{location} の本日の日報を提出しました。</p>
        {!isSupabaseConfigured && (
          <p className="text-xs text-amber-700">
            ※デモモードのため実際の保存は行われません。
          </p>
        )}
        <button
          onClick={() => {
            setDone(false);
            setWorkContent("");
            setSpecialNotes("");
            setAiSummary("");
            setSaving(false);
          }}
          className="mt-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          続けて別の日報を入力
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">日報入力</h1>
        <p className="text-sm text-slate-500">
          {TODAY}・報告者 {currentStaff?.name ?? "—"}
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          現場<span className="ml-1 text-red-500">*</span>
        </span>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={inputClass}
        >
          <option value="">選択してください</option>
          {sites.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
          {location && !sites.some((s) => s.name === location) && (
            <option value={location}>{location}</option>
          )}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">業務内容</span>
        <textarea
          value={workContent}
          onChange={(e) => setWorkContent(e.target.value)}
          className={`${inputClass} h-28 resize-none`}
          placeholder="勤務時間・実施した業務など"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">特記事項</span>
        <textarea
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
          className={`${inputClass} h-20 resize-none`}
          placeholder="異常・引き継ぎ事項など"
        />
      </label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">AI整形文（任意）</span>
          <button
            type="button"
            onClick={polish}
            disabled={polishing}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
          >
            {polishing ? "整形中..." : "✨ AIで整形"}
          </button>
        </div>
        <textarea
          value={aiSummary}
          onChange={(e) => setAiSummary(e.target.value)}
          className={`${inputClass} h-28 resize-none`}
          placeholder="「AIで整形」で読みやすい報告文に整えます。"
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        onClick={submit}
        disabled={saving}
        className="w-full rounded-xl bg-slate-800 py-3.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? "送信中..." : "日報を送信する"}
      </button>
    </div>
  );
}
