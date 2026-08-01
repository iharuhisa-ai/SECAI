-- ============================================================================
-- 警備会社向け管制システム — Supabase スキーマ（新規プロジェクト用・一括実行版）
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
-- 既存プロジェクトへの差分適用は setup_guide.md のマイグレーションを参照。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. テーブル
-- ---------------------------------------------------------------------------

-- 隊員
CREATE TABLE IF NOT EXISTS staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  employee_number VARCHAR(20) UNIQUE NOT NULL,
  department VARCHAR(50),
  employment_type VARCHAR(20) CHECK (employment_type IN ('正社員', '契約', 'パート')),
  phone VARCHAR(20),
  email VARCHAR(100) UNIQUE,
  address VARCHAR(255),
  qualifications TEXT[],
  rank VARCHAR(20),                       -- 新人 / 一般 / ベテラン / 隊長
  days_off_preference TEXT,               -- 休日希望日
  work_preference TEXT,                   -- 出勤希望
  incompatible_staff_ids TEXT[],          -- 組めない隊員（staff.id の配列）
  join_date DATE,
  leave_date DATE,                        -- NULL = 在籍中
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 現場（現場マスタ）
CREATE TABLE IF NOT EXISTS sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255),
  note TEXT,
  requirements JSONB,                     -- 必要人数 [{shift_type,start,end,count}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- シフト
CREATE TABLE IF NOT EXISTS shifts (
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

-- 日報（現場単位。staff_id は任意の「報告者」）
CREATE TABLE IF NOT EXISTS reports (
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

-- プロフィール（ロール）。auth.users と1:1。
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '隊員' CHECK (role IN ('管理者', '管制員', '隊員')),
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. 認証: サインアップ時に profiles を自動作成（既定ロール=隊員）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 現在のユーザーのロールを返す（RLS 回避のため SECURITY DEFINER）
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS（ロール別・推奨形）
--    参照は全認証ユーザー / 作成・編集は管制員・管理者 / 日報は隊員が自分の分を提出可
-- ---------------------------------------------------------------------------
ALTER TABLE staff    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 再実行しても安全なよう、各ポリシーは作成前に DROP する。

-- profiles: 自分の行のみ参照。管理者は全操作。
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all"  ON profiles FOR ALL    TO authenticated
  USING (public.app_role() = '管理者') WITH CHECK (public.app_role() = '管理者');

-- staff / sites / shifts: 参照は全員、更新は管制員・管理者
DROP POLICY IF EXISTS "staff_read" ON staff;
CREATE POLICY "staff_read"   ON staff  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "staff_write" ON staff;
CREATE POLICY "staff_write"  ON staff  FOR ALL    TO authenticated
  USING (public.app_role() IN ('管制員','管理者')) WITH CHECK (public.app_role() IN ('管制員','管理者'));

DROP POLICY IF EXISTS "sites_read" ON sites;
CREATE POLICY "sites_read"   ON sites  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sites_write" ON sites;
CREATE POLICY "sites_write"  ON sites  FOR ALL    TO authenticated
  USING (public.app_role() IN ('管制員','管理者')) WITH CHECK (public.app_role() IN ('管制員','管理者'));

DROP POLICY IF EXISTS "shifts_read" ON shifts;
CREATE POLICY "shifts_read"  ON shifts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "shifts_write" ON shifts;
CREATE POLICY "shifts_write" ON shifts FOR ALL    TO authenticated
  USING (public.app_role() IN ('管制員','管理者')) WITH CHECK (public.app_role() IN ('管制員','管理者'));

-- reports: 参照は全員 / 隊員は自分を報告者とする新規提出のみ / 更新・削除は管制員・管理者
DROP POLICY IF EXISTS "reports_read" ON reports;
CREATE POLICY "reports_read" ON reports FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "reports_insert_member" ON reports;
CREATE POLICY "reports_insert_member" ON reports FOR INSERT TO authenticated
  WITH CHECK (
    public.app_role() IN ('管制員','管理者')
    OR (staff_id = (SELECT staff_id FROM profiles WHERE id = auth.uid()) AND status = '未確認')
  );
DROP POLICY IF EXISTS "reports_update_staff" ON reports;
CREATE POLICY "reports_update_staff" ON reports FOR UPDATE TO authenticated
  USING (public.app_role() IN ('管制員','管理者')) WITH CHECK (public.app_role() IN ('管制員','管理者'));
DROP POLICY IF EXISTS "reports_delete_staff" ON reports;
CREATE POLICY "reports_delete_staff" ON reports FOR DELETE TO authenticated
  USING (public.app_role() IN ('管制員','管理者'));

-- ---------------------------------------------------------------------------
-- 4. サンプルデータ（動作確認用。不要なら以下を削除）
-- ---------------------------------------------------------------------------
INSERT INTO staff (name, employee_number, department, employment_type, phone, email, join_date) VALUES
('山田 太郎', 'S001', '第一警備部', '正社員', '090-1234-5678', 'yamada@example.com', '2020-04-01'),
('鈴木 一郎', 'S002', '第一警備部', '正社員', '090-2345-6789', 'suzuki@example.com', '2021-04-01'),
('佐藤 花子', 'S003', '第二警備部', '契約',   '090-3456-7890', 'sato@example.com',    '2022-06-01'),
('高橋 誠',   'S004', '第二警備部', '正社員', '090-4567-8901', 'takahashi@example.com','2019-10-01'),
('中村 健二', 'S005', '第一警備部', 'パート', '090-5678-9012', 'nakamura@example.com', '2023-01-15')
ON CONFLICT (employee_number) DO NOTHING;

INSERT INTO sites (name, address, note, requirements) VALUES
('本社ビル',     '東京都千代田区丸の内 1-1-1', '常駐2名・24時間',
  '[{"shift_type":"日勤","start":"08:00","end":"20:00","count":2},{"shift_type":"夜勤","start":"20:00","end":"08:00","count":1}]'),
('△△工場',      '神奈川県川崎市川崎区〇〇 2-3', '夜間警備あり',
  '[{"shift_type":"日勤","start":"08:00","end":"20:00","count":1},{"shift_type":"夜勤","start":"20:00","end":"08:00","count":2}]'),
('□□商業施設',  '東京都豊島区東池袋 3-1', '交通誘導・土日は増員',
  '[{"shift_type":"日勤","start":"09:00","end":"18:00","count":3}]'),
('○○マンション', '東京都世田谷区〇〇 4-5-6', '日勤のみ',
  '[{"shift_type":"受付","start":"08:30","end":"17:30","count":1}]');

-- ============================================================================
-- 実行後の設定（詳細は setup_guide.md STEP 5.5）
--  1) Authentication → Users でユーザーを作成
--  2) UPDATE profiles SET role='管制員' WHERE id='（UUID）';
--     隊員は  UPDATE profiles SET role='隊員', staff_id='（staffのUUID）' WHERE id='（UUID）';
-- ============================================================================
