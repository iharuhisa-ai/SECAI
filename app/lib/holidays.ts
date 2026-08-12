// 日本の祝日を算出する（1980〜2099年で有効）。
// 固定祝日 + ハッピーマンデー + 春分/秋分 + 国民の休日 + 振替休日。
// 外部APIに依存しないため、サーバー（AI生成）でも利用可能。

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 月の第n月曜の「日」
function nthMondayDay(year: number, month: number, n: number): number {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=日
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (n - 1) * 7;
}

function vernalEquinox(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function autumnalEquinox(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

const cache = new Map<number, Map<string, string>>();

// 指定年の祝日を { "YYYY-MM-DD": 祝日名 } で返す（年単位でキャッシュ）
export function japaneseHolidays(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;

  const h = new Map<string, string>();
  const add = (m: number, d: number, name: string) => h.set(ymd(year, m, d), name);

  add(1, 1, "元日");
  add(1, nthMondayDay(year, 1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  if (year >= 2020) add(2, 23, "天皇誕生日");
  add(3, vernalEquinox(year), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  add(7, nthMondayDay(year, 7, 3), "海の日");
  add(8, 11, "山の日");
  add(9, nthMondayDay(year, 9, 3), "敬老の日");
  add(9, autumnalEquinox(year), "秋分の日");
  add(10, nthMondayDay(year, 10, 2), "スポーツの日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  // 国民の休日（前後を祝日に挟まれた、日曜以外の平日）
  const base = new Map(h);
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(year, m, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const cur = ymd(year, m, d);
      if (base.has(cur)) continue;
      if (new Date(year, m - 1, d).getDay() === 0) continue;
      const prev = new Date(year, m - 1, d - 1);
      const next = new Date(year, m - 1, d + 1);
      const pKey = ymd(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
      const nKey = ymd(next.getFullYear(), next.getMonth() + 1, next.getDate());
      if (base.has(pKey) && base.has(nKey)) h.set(cur, "国民の休日");
    }
  }

  // 振替休日（祝日が日曜なら、次の祝日でない日）
  const snapshot = Array.from(h.keys());
  for (const key of snapshot) {
    const [yy, mm, dd] = key.split("-").map(Number);
    if (new Date(yy, mm - 1, dd).getDay() !== 0) continue;
    const nd = new Date(yy, mm - 1, dd);
    do {
      nd.setDate(nd.getDate() + 1);
    } while (h.has(ymd(nd.getFullYear(), nd.getMonth() + 1, nd.getDate())));
    h.set(ymd(nd.getFullYear(), nd.getMonth() + 1, nd.getDate()), "振替休日");
  }

  cache.set(year, h);
  return h;
}

// 単日判定
export function holidayName(dateStr: string): string | null {
  const year = Number(dateStr.slice(0, 4));
  if (!year) return null;
  return japaneseHolidays(year).get(dateStr) ?? null;
}
export function isJapaneseHoliday(dateStr: string): boolean {
  return holidayName(dateStr) !== null;
}
