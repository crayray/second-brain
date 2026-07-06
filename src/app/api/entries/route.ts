import { NextRequest, NextResponse } from "next/server";
import { createEntry, listEntries } from "@/lib/journal/store";

export async function GET() {
  return NextResponse.json(listEntries());
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (typeof body.content !== "string" || body.content.trim() === "") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const entry = createEntry({
    content: body.content,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    source: body.source === "phone" ? "phone" : "web",
  });
  return NextResponse.json(entry, { status: 201 });
}
