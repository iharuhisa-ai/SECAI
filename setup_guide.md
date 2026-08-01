# 管制システム 環境構築手順書
## Next.js + Supabase セットアップガイド

**対象者:** 開発担当（HTML基礎レベル）  
**所要時間:** 約60〜90分  
**前提:** Windows または Mac のPC

---

## STEP 1｜必要なツールをインストール（約15分）

### 1-1. Node.js のインストール
1. https://nodejs.org/ja にアクセス
2. 「LTS（推奨版）」をダウンロードしてインストール
3. インストール後、ターミナル（コマンドプロンプト）で確認：
```bash
node -v
# → v20.xx.x のように表示されればOK
```

### 1-2. VS Code のインストール（コードエディタ）
1. https://code.visualstudio.com にアクセスしてインストール
2. 拡張機能「Japanese Language Pack」をインストール（日本語化）

### 1-3. Claude Code のインストール
```bash
npm install -g @anthropic-ai/claude-code
```
インストール確認：
```bash
claude --version
```

---

## STEP 2｜Supabase プロジェクトを作成（約10分）

1. https://supabase.com にアクセス
2. 「Start your project」→ GitHubアカウントでサインアップ
3. 「New project」をクリック
4. 以下を入力して「Create new project」：
   - **Name:** `kansei-system`
   - **Database Password:** 強いパスワードを設定（メモしておく）
   - **Region:** `Northeast Asia (Tokyo)`

5. プロジェクト作成後、以下をメモしておく：
   - **Project URL:** `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key:** Settings → API → `anon` `public` の値

---

## STEP 3｜Next.js プロジェクトを作成（約10分）

ターミナルで以下を実行：

```bash
# デスクトップに移動（任意の場所でOK）
cd ~/Desktop

# Next.js プロジェクト作成
npx create-next-app@latest kansei-system

# 質問への回答（すべてEnterで以下を選択）
# ✔ Would you like to use TypeScript? › Yes
# ✔ Would you like to use ESLint? › Yes
# ✔ Would you like to use Tailwind CSS? › Yes
# ✔ Would you like to use `src/` directory? › No
# ✔ Would you like to use App Router? › Yes
# ✔ Would you like to customize the import alias? › No

# プロジェクトフォルダに移動
cd kansei-system

# Supabase クライアントライブラリをインストール
npm install @supabase/supabase-js @supabase/ssr
```

---

## STEP 4｜環境変数を設定（約5分）

プロジェクトフォルダに `.env.local` ファイルを作成し、以下を記載：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Claude API キー（Anthropic Consoleから取得）
ANTHROPIC_API_KEY=sk-ant-api03-...
```

> ⚠️ `.env.local` は絶対にGitHubにアップしないこと（機密情報）

---

## STEP 5｜Supabaseにテーブルを作成（約15分）

Supabaseダッシュボード → 「SQL Editor」を開き、以下のSQLを貼り付けて実行：

```sql
-- 隊員テーブル
CREATE TABLE staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  employee_number VARCHAR(20) UNIQUE NOT NULL,
  department VARCHAR(50),
  employment_type VARCHAR(20) CHECK (employment_type IN ('正社員', '契約', 'パート')),
  phone VARCHAR(20),
  email VARCHAR(100) UNIQUE,
  address VARCHAR(255),
  qualifications TEXT[],
  rank VARCHAR(20),
  days_off_preference TEXT,
  work_preference TEXT,
  incompatible_staff_ids TEXT[],
  join_date DATE,
  leave_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 現場テーブル（現場マスタ）
CREATE TABLE sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255),
  note TEXT,
  requirements JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- シフトテーブル
CREATE TABLE shifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_type VARCHAR(20) CHECK (shift_type IN ('日勤', '夜勤', '受付', '半日', '休', '明休')),
  start_time TIME,
  end_time TIME,
  location VARCHAR(100),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

-- 日報テーブル
-- 日報テーブル（現場単位で提出。staff_id は任意の「報告者」）
CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  location VARCHAR(100),
  work_content TEXT,
  special_notes TEXT,
  ai_summary TEXT,
  status VARCHAR(20) DEFAULT '未確認' CHECK (status IN ('未確認', '確認済', '要対応')),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- サンプルデータ（動作確認用）
INSERT INTO staff (name, employee_number, department, employment_type, phone, email, join_date) VALUES
('山田 太郎', 'S001', '第一警備部', '正社員', '090-1234-5678', 'yamada@example.com', '2020-04-01'),
('鈴木 一郎', 'S002', '第一警備部', '正社員', '090-2345-6789', 'suzuki@example.com', '2021-04-01'),
('佐藤 花子', 'S003', '第二警備部', '契約', '090-3456-7890', 'sato@example.com', '2022-06-01'),
('高橋 誠',   'S004', '第二警備部', '正社員', '090-4567-8901', 'takahashi@example.com', '2019-10-01'),
('中村 健二', 'S005', '第一警備部', 'パート', '090-5678-9012', 'nakamura@example.com', '2023-01-15');

-- 現場マスタのサンプル
INSERT INTO sites (name, address, note) VALUES
('本社ビル', '東京都千代田区丸の内 1-1-1', '常駐2名・24時間'),
('△△工場', '神奈川県川崎市川崎区〇〇 2-3', '夜間警備あり'),
('□□商業施設', '東京都豊島区東池袋 3-1', '交通誘導・土日は増員'),
('○○マンション', '東京都世田谷区〇〇 4-5-6', '日勤のみ');
```

実行後、左メニュー「Table Editor」で4つのテーブルが作れていれば成功。

> 💡 すでにテーブルを作成済みで列やテーブルが不足している場合は、SQL Editor で次を実行して追加してください：
> ```sql
> ALTER TABLE staff ADD COLUMN IF NOT EXISTS address VARCHAR(255);
> ALTER TABLE staff ADD COLUMN IF NOT EXISTS rank VARCHAR(20);
> ALTER TABLE staff ADD COLUMN IF NOT EXISTS days_off_preference TEXT;
> ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_preference TEXT;
> ALTER TABLE staff ADD COLUMN IF NOT EXISTS incompatible_staff_ids TEXT[];
> -- 勤務区分に「受付」を追加（既存の CHECK 制約を貼り替え）
> ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_type_check;
> ALTER TABLE shifts ADD CONSTRAINT shifts_shift_type_check
>   CHECK (shift_type IN ('日勤', '夜勤', '受付', '半日', '休', '明休'));
> CREATE TABLE IF NOT EXISTS sites (
>   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
>   name VARCHAR(100) NOT NULL,
>   address VARCHAR(255),
>   note TEXT,
>   requirements JSONB,
>   created_at TIMESTAMPTZ DEFAULT NOW()
> );
> -- 既に sites を作成済みの場合は必要人数の列を追加
> ALTER TABLE sites ADD COLUMN IF NOT EXISTS requirements JSONB;
> -- 日報を現場単位に変更: 報告者(staff_id)を任意化し、報告者削除で日報が消えないようにする
> ALTER TABLE reports ALTER COLUMN staff_id DROP NOT NULL;
> ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_staff_id_fkey;
> ALTER TABLE reports ADD CONSTRAINT reports_staff_id_fkey
>   FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL;
> ```

---

## STEP 5.5｜ログイン認証（ロール）を設定

ログイン（Supabase Auth）とロール制御を使う場合、SQL Editor で以下を実行して `profiles` テーブルを作成します。**Supabase を設定しない「デモモード」では認証は不要**（この手順はスキップ可）です。

```sql
-- プロフィール（ロール）テーブル。auth.users と1:1で紐づく。
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '隊員' CHECK (role IN ('管理者', '管制員', '隊員')),
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL, -- 隊員アカウントを staff に紐付け（任意）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: 自分のプロフィールのみ参照可能
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- ユーザー作成時に profiles を自動作成（既定ロール=隊員）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**ユーザーの作成とロール付与**

1. Supabaseダッシュボード → Authentication → Users → 「Add user」でメール＋パスワードのユーザーを作成（初回はメール確認をオフにすると楽です）。
2. 作成したユーザーの `id` を控え、SQL Editor でロールを設定：
   ```sql
   -- 管制員に設定
   UPDATE profiles SET role = '管制員' WHERE id = '（ユーザーのUUID）';
   -- 隊員アカウントを staff に紐付ける場合
   UPDATE profiles SET role = '隊員', staff_id = '（staffのUUID）' WHERE id = '（ユーザーのUUID）';
   ```
3. ログイン後、**管理者・管制員は管制画面（/dashboard 等）**、**隊員はスマホ画面（/m/home）** へ自動で振り分けられます。

---

## STEP 5.6｜各テーブルの RLS（アクセス制御）

本番運用では各テーブルにも **RLS（行レベルセキュリティ）** の設定を推奨します。以下のいずれかを SQL Editor で実行してください（デモモードでは不要）。

> ⚠️ RLS を有効化すると、ポリシーが無いテーブルは**全アクセス拒否**になります。必ずポリシーもセットで作成してください。アプリはログインユーザーのJWTで通信するため、`to authenticated`（認証済み）のポリシーが効きます。

### パターンA｜認証済みユーザーのみ読み書き可（基本形）

まず手早く「ログインしていれば全操作OK」にする最小構成です。

```sql
-- 対象テーブルで RLS を有効化
ALTER TABLE staff   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites   ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーに全操作（SELECT/INSERT/UPDATE/DELETE）を許可
CREATE POLICY "staff_authenticated_all"   ON staff   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shifts_authenticated_all"  ON shifts  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "reports_authenticated_all" ON reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sites_authenticated_all"   ON sites   FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### パターンB｜ロール別（推奨）

「隊員は参照中心・日報の提出のみ可」「作成/編集は管制員・管理者のみ」といった実運用向けの構成です。まずロール取得用のヘルパー関数を作成します（`profiles` の RLS を回避するため `SECURITY DEFINER`）。

```sql
-- 現在のユーザーのロールを返す（profiles を安全に参照）
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- RLS 有効化（未実行の場合）
ALTER TABLE staff   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites   ENABLE ROW LEVEL SECURITY;

-- 隊員(staff)・現場(sites)・シフト(shifts): 参照は全認証ユーザー、更新は管制員/管理者のみ
CREATE POLICY "staff_read"  ON staff  FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_write" ON staff  FOR ALL    TO authenticated
  USING (public.app_role() IN ('管制員','管理者'))
  WITH CHECK (public.app_role() IN ('管制員','管理者'));

CREATE POLICY "sites_read"  ON sites  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sites_write" ON sites  FOR ALL    TO authenticated
  USING (public.app_role() IN ('管制員','管理者'))
  WITH CHECK (public.app_role() IN ('管制員','管理者'));

CREATE POLICY "shifts_read"  ON shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "shifts_write" ON shifts FOR ALL    TO authenticated
  USING (public.app_role() IN ('管制員','管理者'))
  WITH CHECK (public.app_role() IN ('管制員','管理者'));

-- 日報(reports): 参照は全認証ユーザー。
--   - 隊員は「新規提出(INSERT)」のみ可（自分を報告者とする、初期ステータスは未確認）
--   - 更新/削除（ステータス変更など）は管制員/管理者のみ
CREATE POLICY "reports_read" ON reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "reports_insert_member" ON reports FOR INSERT TO authenticated
  WITH CHECK (
    public.app_role() IN ('管制員','管理者')
    OR (staff_id = (SELECT staff_id FROM profiles WHERE id = auth.uid()) AND status = '未確認')
  );

CREATE POLICY "reports_update_staff" ON reports FOR UPDATE TO authenticated
  USING (public.app_role() IN ('管制員','管理者'))
  WITH CHECK (public.app_role() IN ('管制員','管理者'));

CREATE POLICY "reports_delete_staff" ON reports FOR DELETE TO authenticated
  USING (public.app_role() IN ('管制員','管理者'));
```

### profiles のロール管理（任意）

ロールの付与・変更をアプリからも行いたい場合は、管理者に profiles の全操作を許可します（既定では自分の行の参照のみ）。

```sql
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL TO authenticated
  USING (public.app_role() = '管理者')
  WITH CHECK (public.app_role() = '管理者');
```

> 💡 ポリシーの削除は `DROP POLICY "ポリシー名" ON テーブル名;`。要件に合わせて調整してください（例: 隊員にも自分のシフト更新を許可する等）。上記はあくまで雛形です。

---

## STEP 6｜Supabase クライアントを設定（約5分）

`app/lib/supabase.ts` ファイルを作成：

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

---

## STEP 7｜開発サーバーを起動して確認（約5分）

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開き、Next.jsの初期画面が表示されればOK。

---

## STEP 8｜Claude Codeで開発開始（ここから本番）

ターミナルで、プロジェクトフォルダ内から Claude Code を起動：

```bash
cd ~/Desktop/kansei-system
claude
```

起動したら、以下をそのままコピーして貼り付けてください：

---

### 🚀 Claude Codeへの最初の指示文（コピーして使用）

```
このプロジェクトはNext.js 14（App Router）+ Supabase + Tailwind CSSで構築する警備会社向け管制システムです。

Supabaseには以下のテーブルが作成済みです：
- staff（隊員）: id, name, employee_number, department, employment_type, phone, email, qualifications, join_date, leave_date
- shifts（シフト）: id, staff_id, date, shift_type, start_time, end_time, location, note
- reports（日報）: id, staff_id, date, location, work_content, special_notes, ai_summary, status

まず以下を実装してください：

1. app/lib/supabase.ts（Supabaseクライアント設定）が存在しない場合は作成
2. app/staff/page.tsx：隊員一覧ページ
   - Supabaseからstaffテーブルを全件取得して表示
   - 氏名・社員番号・所属・雇用形態・電話番号を表形式で表示
   - 「新規登録」ボタン（クリックでモーダル表示）
   - 検索バー（氏名・社員番号で絞り込み）
   - 雇用形態フィルター（全員/正社員/契約/パート）
3. 隊員の新規登録・編集・削除（論理削除）機能
4. Tailwind CSSでシンプルで見やすいデザインにすること

実装後、動作確認のポイントも教えてください。
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `npm: command not found` | Node.jsが未インストール | STEP 1-1を再実行 |
| Supabase接続エラー | 環境変数が間違っている | `.env.local`のURLとKeyを再確認 |
| `Module not found` | ライブラリ未インストール | `npm install`を再実行 |
| 画面が真っ白 | JSエラー | ブラウザの開発者ツール（F12）でエラー確認 |

---

## 次のステップ（環境構築完了後）

1. ✅ 隊員管理ページの完成
2. 🔲 シフト管理ページ（月次カレンダー）
3. 🔲 日報入力・管理ページ
4. 🔲 ログイン認証（Supabase Auth）
5. 🔲 スマホ対応（レスポンシブ）

---

*行き詰まったら、エラーメッセージをそのままClaudeに貼り付けてください。*
```
