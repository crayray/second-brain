import { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { buildChatMessages } from "@/lib/chat/prompt";
import { createThinkFilter } from "@/lib/chat/think-filter";
import { retrieve } from "@/lib/rag/retrieve";

export const dynamic = "force-dynamic";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// Response is NDJSON: one {type:"citations"} line, then {type:"token"} lines.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const history: HistoryMessage[] = Array.isArray(body.messages)
    ? body.messages.filter(
        (m: HistoryMessage) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
    : [];
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return Response.json({ error: "no user message" }, { status: 400 });
  }

  const chunks = await retrieve(lastUser.content);
  const messages = buildChatMessages({ history, chunks });

  const { ollamaBaseUrl, chatModel } = getConfig();
  const upstream = await fetch(`${ollamaBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: chatModel, messages, stream: true }),
  });
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: `model backend error (${upstream.status})` },
      { status: 502 }
    );
  }

  const citations = [
    ...new Map(
      chunks.map((c) => [
        c.entryId,
        {
          entryId: c.entryId,
          date: c.date,
          excerpt: c.text.replace(/\s+/g, " ").slice(0, 120),
        },
      ])
    ).values(),
  ];

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      const thinkFilter = createThinkFilter();
      const sendText = (text: string) => {
        if (text.length > 0) send({ type: "token", text });
      };

      send({ type: "citations", citations });

      let sseBuffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const data = line.replace(/^data: /, "").trim();
            if (data === "" || data === "[DONE]") continue;
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
              sendText(thinkFilter.push(delta));
            }
          }
        }
        sendText(thinkFilter.flush());
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", message: String(error) });
      } finally {
        controller.close();
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
