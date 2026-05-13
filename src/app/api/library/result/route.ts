import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { resolveLibraryFile, saveLibraryFile } from "@/lib/server-library";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json({ error: "Informe o nome do resultado." }, { status: 400 });
    }

    const filePath = resolveLibraryFile("resultado", name);
    return NextResponse.json({
      name,
      text: readFileSync(filePath, "utf8")
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Nao foi possivel abrir o resultado salvo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as { name?: string; text?: string };

    if (!data.name || !data.text) {
      return NextResponse.json({ error: "Informe nome e texto do resultado." }, { status: 400 });
    }

    const filename = data.name.toLowerCase().endsWith(".txt") ? data.name : `${data.name}.txt`;
    saveLibraryFile("resultado", filename, Buffer.from(data.text, "utf8"));

    return NextResponse.json({ saved: filename });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Nao foi possivel salvar o resultado." }, { status: 500 });
  }
}
