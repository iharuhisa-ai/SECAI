import Link from "next/link";

export default function Home() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-800">管制システム</h1>
      <p className="mt-2 text-slate-600">警備会社向け管制システムです。</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        ダッシュボードへ
      </Link>
    </div>
  );
}
