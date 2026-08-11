"use client";

import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/app/lib/supabase";
import { SAMPLE_SITES } from "@/app/lib/sampleSites";
import { reqDaysLabel } from "@/app/lib/requirement";
import type { Site, SiteFormValues } from "@/app/lib/types";
import SiteModal from "./SiteModal";

function toRecord(v: SiteFormValues) {
  // 区分が空・人数0以下の行は除外
  const requirements = v.requirements.filter((r) => r.shift_type && r.count > 0);
  return {
    name: v.name.trim(),
    address: v.address.trim() || null,
    note: v.note.trim() || null,
    requirements: requirements.length > 0 ? requirements : null,
  };
}

export default function SettingsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Site | null>(null);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    if (!isSupabaseConfigured) {
      setSites((prev) => (prev.length > 0 ? prev : SAMPLE_SITES));
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from("sites").select("*").order("name");
    if (error) {
      setLoadError(error.message);
      setSites([]);
    } else {
      setSites((data as Site[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };
  const openEdit = (s: Site) => {
    setEditTarget(s);
    setModalOpen(true);
  };

  const handleSubmit = async (values: SiteFormValues) => {
    const record = toRecord(values);

    if (!isSupabaseConfigured) {
      const now = new Date().toISOString();
      if (editTarget) {
        setSites((prev) =>
          prev.map((s) => (s.id === editTarget.id ? { ...s, ...record } : s))
        );
      } else {
        setSites((prev) => [
          ...prev,
          { ...record, id: `demo-site-${Date.now()}`, created_at: now },
        ]);
      }
      setModalOpen(false);
      setEditTarget(null);
      return;
    }

    if (editTarget) {
      const { error } = await supabase.from("sites").update(record).eq("id", editTarget.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("sites").insert(record);
      if (error) throw new Error(error.message);
    }
    setModalOpen(false);
    setEditTarget(null);
    await fetchSites();
  };

  const handleDelete = async (s: Site) => {
    const ok = window.confirm(`現場「${s.name}」を削除します。よろしいですか？`);
    if (!ok) return;

    if (!isSupabaseConfigured) {
      setSites((prev) => prev.filter((x) => x.id !== s.id));
      return;
    }
    const { error } = await supabase.from("sites").delete().eq("id", s.id);
    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    await fetchSites();
  };

  return (
    <div className="p-6 md:p-8">
      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">デモ表示中</span>（Supabase未接続）。サンプルの現場を表示しています。
          登録・編集・削除は画面上だけで動作し、保存はされません。
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">設定 ・ 現場マスタ</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "読み込み中..." : `${sites.length} 件の現場`}・日報やシフトの現場選択に使用します
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          ＋ 現場を追加
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">現場名</th>
              <th className="px-4 py-3 font-medium">住所</th>
              <th className="px-4 py-3 font-medium">必要人数</th>
              <th className="px-4 py-3 font-medium">備考</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loadError && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-red-600">
                  読み込みエラー: {loadError}
                  <br />
                  <span className="text-slate-500">
                    .env.local の Supabase 接続情報と sites テーブルをご確認ください。
                  </span>
                </td>
              </tr>
            )}
            {!loadError && loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  読み込み中...
                </td>
              </tr>
            )}
            {!loadError && !loading && sites.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  現場が登録されていません。「＋ 現場を追加」から登録してください。
                </td>
              </tr>
            )}
            {!loadError &&
              !loading &&
              sites.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.address ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.requirements && s.requirements.length > 0 ? (
                      <div className="space-y-0.5">
                        {s.requirements.map((r, i) => (
                          <div key={i} className="whitespace-nowrap text-xs">
                            {r.shift_type} {r.start}-{r.end}{" "}
                            <span className="font-medium text-slate-800">{r.count}名</span>{" "}
                            <span className="text-slate-400">({reqDaysLabel(r)})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.note ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(s)}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="rounded border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <SiteModal
          target={editTarget}
          onClose={() => {
            setModalOpen(false);
            setEditTarget(null);
          }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
