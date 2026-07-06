import { getConfig } from "@/lib/config";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { ollamaBaseUrl, embedModel } = getConfig();
  const response = await fetch(`${ollamaBaseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: embedModel, input: texts }),
  });
  if (!response.ok) {
    throw new Error(
      `Embedding request failed (${response.status}): ${await response.text()}`
    );
  }
  const data = await response.json();
  return data.embeddings;
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
