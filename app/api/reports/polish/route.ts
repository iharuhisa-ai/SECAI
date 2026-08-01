import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface PolishBody {
  work_content?: string;
  special_notes?: string;
  location?: string;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AI文章補助には ANTHROPIC_API_KEY の設定が必要です。.env.local に設定してください。",
      },
      { status: 503 }
    );
  }

  let body: PolishBody;
  try {
    body = (await req.json()) as PolishBody;
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  const work = (body.work_content ?? "").trim();
  const notes = (body.special_notes ?? "").trim();
  if (!work && !notes) {
    return NextResponse.json(
      { error: "整形する業務内容・特記事項がありません。" },
      { status: 400 }
    );
  }

  const client = new Anthropic();

  const system = `あなたは警備会社の日報作成を補助するアシスタントです。
現場隊員が入力した日報の下書きを、管制員や顧客が読みやすい正式な業務報告文に整えます。

ルール:
- 誤字脱字を修正し、口語を丁寧な書き言葉に整える。
- 事実は改変しない。記載のない情報を勝手に追加しない。
- 時系列・要点が分かるよう簡潔にまとめる。だらだらと長くしない。
- 警備業務にふさわしい客観的・中立的な文体にする。
- 出力は整形後の本文のみ。前置き・見出し・箇条書き記号・引用符は付けない。`;

  const userPrompt = `以下の日報の下書きを整形してください。
${body.location ? `\n【現場】${body.location}` : ""}

【業務内容】
${work || "（記載なし）"}

【特記事項】
${notes || "（記載なし）"}`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "AIがこのリクエストへの応答を拒否しました。" },
        { status: 422 }
      );
    }

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "AIから整形結果を取得できませんでした。" },
        { status: 502 }
      );
    }

    return NextResponse.json({ summary: textBlock.text.trim() });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `AI文章補助に失敗しました: ${messageText}` },
      { status: 500 }
    );
  }
}
