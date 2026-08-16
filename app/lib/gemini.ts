// サーバー専用。Google Gemini API を REST で呼ぶ薄いヘルパー。
// GEMINI_API_KEY は環境変数から読む（ハードコード禁止）。
// ローリングエイリアス（常に利用可能な最新Flash）を既定に。
// 必要なら GEMINI_MODEL 環境変数で上書き（例: gemini-2.0-flash / gemini-pro-latest）。
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GenerateOptions {
  system: string;
  prompt: string;
  /** 指定すると JSON 構造化出力（Gemini responseSchema 形式）で返す */
  jsonSchema?: unknown;
  maxOutputTokens?: number;
}

// 生成結果の本文テキストを返す。失敗時は Error を投げる。
export async function geminiGenerate(opts: GenerateOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("NO_KEY");

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
    temperature: 0.7,
  };
  if (opts.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = opts.jsonSchema;
  }

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig,
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
    key
  )}`;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // 429/500/502/503/504 は一時的（過負荷・レート超過）なので指数バックオフで再試行する。
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // ネットワーク一時エラーも再試行
      lastError = new Error("Gemini API への接続に失敗しました。");
      if (attempt < MAX_ATTEMPTS) {
        await sleep(400 * 2 ** (attempt - 1) + Math.random() * 300);
        continue;
      }
      throw lastError;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const rawMsg =
        (data as { error?: { message?: string } })?.error?.message ??
        `Gemini API エラー (${res.status})`;
      if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
        lastError = new Error(rawMsg);
        await sleep(600 * 2 ** (attempt - 1) + Math.random() * 400); // 0.6s,1.2s,2.4s(+jitter)
        continue;
      }
      // 再試行しても過負荷なら分かりやすい日本語に置き換える
      if (RETRYABLE.has(res.status)) {
        throw new Error(
          "AIが混雑しています（時間をおいて再度お試しください）。対象の隊員数を減らすと成功しやすくなります。"
        );
      }
      throw new Error(rawMsg);
    }

    const cand = (data as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    })?.candidates?.[0];

    const text = (cand?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const reason =
        (data as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason ??
        cand?.finishReason ??
        "unknown";
      throw new Error(`Gemini から応答を取得できませんでした（${reason}）。`);
    }
    return text;
  }

  throw lastError ?? new Error("Gemini API エラー");
}
