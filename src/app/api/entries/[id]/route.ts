import { NextRequest, NextResponse } from "next/server";
import { deleteEntry, getEntry, updateEntry } from "@/lib/journal/store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const entry = getEntry(id);
  if (!entry) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(entry);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  if (typeof body.content !== "string" || body.content.trim() === "") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!getEntry(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const entry = updateEntry(id, {
    content: body.content,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
  });
  return NextResponse.json(entry);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  deleteEntry(id);
  return NextResponse.json({ ok: true });
}
