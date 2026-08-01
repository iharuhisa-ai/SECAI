import { NextResponse } from "next/server";
import { getCaller, getServiceClient, isController } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

// 共通ガード: サービスキーの有無と、呼び出し元が管制員/管理者かを検証。
async function guard() {
  const svc = getServiceClient();
  if (!svc) {
    return {
      error: NextResponse.json(
        {
          error:
            "ユーザー管理には SUPABASE_SERVICE_ROLE_KEY（サーバー用のシークレットキー）の設定が必要です。",
        },
        { status: 503 }
      ),
    };
  }
  const caller = await getCaller();
  if (!isController(caller.role)) {
    return {
      error: NextResponse.json({ error: "権限がありません（管制員・管理者のみ）。" }, { status: 403 }),
    };
  }
  return { svc, caller };
}

// 一覧
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const svc = g.svc;

  const { data, error } = await svc.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profiles } = await svc.from("profiles").select("id, role, staff_id");
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const users = data.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      role: (pmap.get(u.id)?.role as string) ?? "隊員",
      staff_id: (pmap.get(u.id)?.staff_id as string | null) ?? null,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  return NextResponse.json({ users });
}

// 追加
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const svc = g.svc;

  let body: {
    email?: string;
    password?: string;
    role?: string;
    staff_id?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  const role = body.role ?? "隊員";
  const staff_id = body.staff_id || null;

  if (!email || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードは必須です。" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上にしてください。" }, { status: 400 });
  }

  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 管制側で作成するため確認メール不要
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // トリガーで profiles は自動作成されるが、ロール・紐付けを確定させる
  const { error: pErr } = await svc
    .from("profiles")
    .upsert({ id: data.user.id, role, staff_id });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.user.id });
}

// ロール・紐付けの変更
export async function PATCH(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const svc = g.svc;

  let body: { id?: string; role?: string; staff_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id は必須です。" }, { status: 400 });

  const patch: { role?: string; staff_id?: string | null } = {};
  if (body.role !== undefined) patch.role = body.role;
  if (body.staff_id !== undefined) patch.staff_id = body.staff_id || null;

  const { error } = await svc.from("profiles").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// 削除
export async function DELETE(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const svc = g.svc;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id は必須です。" }, { status: 400 });

  // 自分自身は削除不可
  if (id === g.caller.userId) {
    return NextResponse.json({ error: "自分自身のアカウントは削除できません。" }, { status: 400 });
  }

  const { error } = await svc.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // profiles は ON DELETE CASCADE で自動削除

  return NextResponse.json({ ok: true });
}
