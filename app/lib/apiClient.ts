// API 呼び出しの共通ヘルパー。
// 応答が JSON でない（HTMLエラーページ等）場合でも、わかりやすい Error を投げる。
export async function requestJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("通信に失敗しました。ネットワーク接続を確認してください。");
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // JSON ではない（HTMLエラーページ等）
    data = null;
  }

  const errObj = data as { error?: string } | null;

  if (!res.ok) {
    if (errObj?.error) throw new Error(errObj.error);
    if (res.status === 504 || res.status === 408) {
      throw new Error(
        "処理に時間がかかり、応答がタイムアウトしました。対象の人数を減らして再度お試しください。"
      );
    }
    if (res.status >= 500) {
      throw new Error(
        `サーバーエラー (${res.status})。処理に時間がかかり応答しなかった可能性があります。対象を減らすか、時間をおいて再度お試しください。`
      );
    }
    throw new Error(`エラーが発生しました (${res.status})。`);
  }

  if (data === null) {
    throw new Error(
      "サーバーから予期しない応答が返りました（処理に時間がかかった可能性があります）。時間をおいて再度お試しください。"
    );
  }
  return data as T;
}
