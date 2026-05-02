import { statSync } from "node:fs";
import { NextResponse } from "next/server";
import { resolveLibraryFile, streamLibraryFile } from "@/lib/server-library";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json({ error: "Informe o nome do MP3." }, { status: 400 });
    }

    const filePath = resolveLibraryFile("vs", name);
    const stats = statSync(filePath);
    const stream = streamLibraryFile("vs", name);

    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(stats.size),
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Nao foi possivel abrir o MP3 da pasta vs." }, { status: 500 });
  }
}
