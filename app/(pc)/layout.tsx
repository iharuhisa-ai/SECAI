import Link from "next/link";
import AuthStatus from "@/app/components/AuthStatus";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/staff", label: "隊員管理" },
  { href: "/shift", label: "シフト管理" },
  { href: "/attendance", label: "勤怠（打刻）" },
  { href: "/reports", label: "日報管理" },
  { href: "/users", label: "ユーザー管理" },
  { href: "/settings", label: "設定（現場マスタ）" },
];

export default function PcLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      {/* サイドバー（管制員PC向け） */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-14 items-center border-b border-slate-200 px-5 text-lg font-bold text-slate-800">
          管制システム
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/m/home"
            className="mt-2 block rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            📱 隊員用（スマホ）
          </Link>
        </nav>
        <AuthStatus variant="sidebar" />
      </aside>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
