# デプロイ手順 ＆ 実接続 通しテスト

管制システムを Supabase（実データ）＋ Netlify（本番ホスティング）で動かすための手順書です。
Supabase を設定しない場合は「デモモード」で認証不要のまま動作します。

---

## 0. 準備するもの

| 項目 | 取得先 |
|------|--------|
| GitHub リポジトリ | このプロジェクトを push |
| Supabase プロジェクト | https://supabase.com |
| Claude API キー | https://console.anthropic.com （AIシフト作成・日報整形に使用） |
| Netlify アカウント | https://netlify.com |

必要な環境変数（3つ）:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
ANTHROPIC_API_KEY=sk-ant-api03-...
```

> `NEXT_PUBLIC_` の2つが揃うと認証あり本番モード、無ければデモモードになります。

---

## 1. Supabase を用意する

1. Supabase で新規プロジェクトを作成（Region: Tokyo 推奨）。
2. **SQL Editor** に [`supabase/schema.sql`](supabase/schema.sql) を貼り付けて実行（テーブル・トリガー・RLS・サンプルデータが一括作成されます）。
3. **Settings → API** から `Project URL` と `anon public` キーを控える。
4. **Authentication → Providers → Email** を有効化。社内利用なら **「Confirm email」をオフ**にすると運用が簡単です（メール確認リンク不要）。
5. **Authentication → Users → Add user** で管制員・隊員のアカウントを作成。
6. **SQL Editor** でロールを付与：
   ```sql
   -- 管制員
   UPDATE profiles SET role = '管制員' WHERE id = '（ユーザーのUUID）';
   -- 隊員（スマホ画面。staff に紐付けると日報の報告者が自動特定される）
   UPDATE profiles SET role = '隊員', staff_id = '（staffのUUID）' WHERE id = '（ユーザーのUUID）';
   ```
   ※ staff の UUID は Table Editor の staff テーブルで確認できます。

---

## 2. ローカルで実接続テスト（デプロイ前の確認）

1. プロジェクト直下に `.env.local` を作成し、上記3つの環境変数を記入。
2. 起動：
   ```bash
   npm install
   npm run dev
   ```
3. `http://localhost:3000` を開くと `/login` にリダイレクトされる（＝認証が有効）。
4. 下記「通しテスト チェックリスト」を実施。

---

## 3. Netlify へデプロイ

このリポジトリには [`netlify.toml`](netlify.toml) を同梱済みです（ビルドコマンド・Node 20・公式 Next.js ランタイム）。Netlify が Next.js を検出し、SSR・API ルート・middleware を自動でホストします。

1. プロジェクトを GitHub に push。
2. Netlify → **Add new site → Import an existing project** → GitHub の対象リポジトリを選択。
3. ビルド設定は `netlify.toml` から自動反映されます（Build command `npm run build` / Node 20 / Next.js プラグイン）。手動で変更する必要はありません。
4. **Site configuration → Environment variables** に上記3つを登録：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`（Publishable key `sb_publishable_...` でOK）
   - `ANTHROPIC_API_KEY`（AIを使う場合。使わないなら未設定でOK）
5. **Deploy site** を実行。
6. デプロイ後、Supabase → **Authentication → URL Configuration → Site URL** を Netlify の本番URL（例 `https://your-app.netlify.app`）に設定。

> - ビルドは環境変数なしでも成功します（デモモードのフォールバックがあるため）。本番挙動には Netlify 側の環境変数設定が必須です。
> - 環境変数を後から追加/変更したら、**再デプロイ**（Deploys → Trigger deploy → Deploy site）が必要です。
> - `@netlify/plugin-nextjs` は `netlify.toml` の宣言により Netlify が自動インストールします（package.json への追加は不要）。

<details>
<summary>（参考）Vercel を使う場合</summary>

1. GitHub に push → Vercel で **Add New → Project** → Import（Next.js 自動判定）。
2. **Environment Variables** に上記3つを登録 → **Deploy**。
3. Supabase の Site URL を Vercel の本番URLに設定。
</details>

---

## 4. 通しテスト チェックリスト

### 認証・ロール
- [ ] 未ログインで任意ページ → `/login` にリダイレクトされる
- [ ] 管制員でログイン → `/dashboard` に遷移
- [ ] 隊員でログイン → `/m/home` に遷移（PC画面 `/staff` 等へ行っても `/m/home` に戻される）
- [ ] サイドバー／スマホヘッダーの「ログアウト」で `/login` に戻る

### 隊員管理（管制員）
- [ ] 新規登録・編集・退職/復職・CSVインポートが保存される（再読込しても残る）

### シフト管理（管制員）
- [ ] セル編集・ドラッグコピー・前月コピーが保存される
- [ ] 区分/時間の表示切替、最下部の充足状況インジケータが正しい
- [ ] AIでシフト作成 → 生成・反映される（`ANTHROPIC_API_KEY` 設定時）

### 現場マスタ（管制員）
- [ ] 現場の追加・編集・削除、必要人数の登録が保存される

### 日報（管制員）
- [ ] 現場単位で作成・確認・ステータス変更、PDF出力、未提出アラート（現場）
- [ ] AIで整形が動作する（`ANTHROPIC_API_KEY` 設定時）

### スマホ（隊員）
- [ ] ヘッダーがログイン隊員名で固定表示（切替不可）
- [ ] 本日のシフト・今月のシフトが自分の分だけ表示
- [ ] 日報入力 → 送信が保存される（現場は当日シフトから自動セット、報告者＝自分）
- [ ] 管制員の日報一覧に、隊員が送信した日報が反映される

### RLS（権限）
- [ ] 隊員アカウントで staff/shifts の更新ができない（参照は可）
- [ ] 隊員アカウントで他人の日報を提出できない（自分の分のみ）

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| ログインしてもデータが空 | RLS ポリシー未作成、または `profiles` にロール行が無い。schema.sql の実行とロール付与を確認 |
| 隊員で日報送信が失敗 | `profiles.staff_id` が未設定。該当ユーザーに staff を紐付ける |
| AI機能が503 | `ANTHROPIC_API_KEY` 未設定。Netlify の環境変数を確認 |
| ずっと `/login` に戻される | Cookie がブロックされている／Site URL 未設定。Supabase の URL Configuration を確認 |
