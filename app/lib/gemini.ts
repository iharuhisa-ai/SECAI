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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
      key
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      `Gemini API エラー (${res.status})`;
    throw new Error(msg);
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
