import { afterEach, describe, expect, it, vi } from "vitest";
import { embedTexts } from "./embed";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.EMBED_MODEL;
});

describe("embedTexts", () => {
  it("posts to the Ollama embed endpoint with the configured model", async () => {
    process.env.OLLAMA_BASE_URL = "http://test-host:1234";
    process.env.EMBED_MODEL = "test-embed-model";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await embedTexts(["hello"]);

    expect(result).toEqual([[0.1, 0.2]]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://test-host:1234/api/embed",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("test-embed-model");
    expect(body.input).toEqual(["hello"]);
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 }))
    );
    await expect(embedTexts(["hello"])).rejects.toThrow(/500/);
  });
});
