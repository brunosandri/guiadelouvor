import { NextResponse } from "next/server";
import { listLibraryFiles, type LibraryKind } from "@/lib/server-library";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") as LibraryKind | null;
  const query = searchParams.get("q") ?? "";
  const limit = Number(searchParams.get("limit") ?? "80");

  if (kind !== "cifra" && kind !== "vs" && kind !== "resultado") {
    return NextResponse.json({ error: "Tipo de biblioteca invalido." }, { status: 400 });
  }

  return NextResponse.json({
    files: listLibraryFiles(kind, query, Number.isFinite(limit) ? limit : 80)
  });
}
