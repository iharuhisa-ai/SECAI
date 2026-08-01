import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// 認証・ロール制御ミドルウェア。
// Supabase 未設定（デモモード）では何もしない＝これまでのデモがそのまま動く。
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // デモモード: 認証なしで全許可
  if (!url || !key) return NextResponse.next();

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isLogin = path === "/login";

  // 未ログイン
  if (!user) {
    if (isLogin) return res;
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.search = `?redirect=${encodeURIComponent(path)}`;
    return NextResponse.redirect(to);
  }

  // ログイン済み: ロール取得
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string) ?? "隊員";
  const isMobile = path.startsWith("/m");

  // ログイン済みで /login に来たらロール別ホームへ
  if (isLogin) {
    const to = req.nextUrl.clone();
    to.pathname = role === "隊員" ? "/m/home" : "/dashboard";
    to.search = "";
    return NextResponse.redirect(to);
  }

  // 隊員は管制員向け（PC）画面へアクセス不可 → スマホホームへ
  if (role === "隊員" && !isMobile) {
    const to = req.nextUrl.clone();
    to.pathname = "/m/home";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return res;
}

export const config = {
  // API・静的ファイルは対象外
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
