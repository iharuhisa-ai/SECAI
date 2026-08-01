// 依存ライブラリなしの軽量CSVパーサ。
// ダブルクォート囲み（"" によるエスケープ）・改行入りセル・CRLF に対応する。

// 1行（複数フィールド）の配列に分解
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  // 先頭の BOM を除去
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++; // エスケープされた " を1文字としてスキップ
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // CRLF の \r は次の \n とまとめて1改行として扱う
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else {
      field += ch;
    }
  }

  // 最終フィールド／行（末尾改行なしの場合）
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 完全な空行を除去
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ヘッダー名 → staff フィールドのマッピング（表記ゆれを吸収）
const HEADER_ALIASES: Record<string, string> = {
  氏名: "name",
  名前: "name",
  name: "name",
  社員番号: "employee_number",
  社員No: "employee_number",
  employee_number: "employee_number",
  所属: "department",
  所属部署: "department",
  部署: "department",
  department: "department",
  雇用形態: "employment_type",
  employment_type: "employment_type",
  電話番号: "phone",
  電話: "phone",
  phone: "phone",
  メールアドレス: "email",
  メール: "email",
  email: "email",
  住所: "address",
  address: "address",
  保有資格: "qualifications",
  資格: "qualifications",
  qualifications: "qualifications",
  入社日: "join_date",
  join_date: "join_date",
};

export interface CsvStaffRow {
  name: string;
  employee_number: string;
  department: string;
  employment_type: string;
  phone: string;
  email: string;
  address: string;
  qualifications: string; // カンマ/スラッシュ区切り（生の文字列）
  join_date: string;
}

export interface CsvParseResult {
  rows: CsvStaffRow[];
  // 認識できなかったヘッダー（参考表示用）
  unknownHeaders: string[];
  // 必須ヘッダー（氏名・社員番号）が見つかったか
  hasName: boolean;
  hasEmployeeNumber: boolean;
}

export function parseStaffCsv(text: string): CsvParseResult {
  const table = parseCsvRows(text);
  if (table.length === 0) {
    return { rows: [], unknownHeaders: [], hasName: false, hasEmployeeNumber: false };
  }

  const header = table[0].map((h) => h.trim());
  const unknownHeaders: string[] = [];
  const fieldByIndex: (keyof CsvStaffRow | null)[] = header.map((h) => {
    const key = HEADER_ALIASES[h] ?? HEADER_ALIASES[h.toLowerCase()];
    if (!key) {
      unknownHeaders.push(h);
      return null;
    }
    return key as keyof CsvStaffRow;
  });

  const empty: CsvStaffRow = {
    name: "",
    employee_number: "",
    department: "",
    employment_type: "",
    phone: "",
    email: "",
    address: "",
    qualifications: "",
    join_date: "",
  };

  const rows: CsvStaffRow[] = table.slice(1).map((cols) => {
    const r: CsvStaffRow = { ...empty };
    fieldByIndex.forEach((field, idx) => {
      if (field) r[field] = (cols[idx] ?? "").trim();
    });
    return r;
  });

  return {
    rows,
    unknownHeaders,
    hasName: fieldByIndex.includes("name"),
    hasEmployeeNumber: fieldByIndex.includes("employee_number"),
  };
}

// CSV テンプレート文字列（ダウンロード用）
export const STAFF_CSV_TEMPLATE =
  "氏名,社員番号,所属部署,雇用形態,電話番号,メールアドレス,住所,保有資格,入社日\n" +
  "山田 太郎,S001,第一警備部,正社員,090-1234-5678,yamada@example.com,東京都千代田区〇〇 1-2-3,施設警備2級,2020-04-01\n";
