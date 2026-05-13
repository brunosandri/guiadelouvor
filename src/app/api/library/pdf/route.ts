import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf-extractor";
import { resolveLibraryFile } from "@/lib/server-library";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json({ error: "Informe o nome do PDF." }, { status: 400 });
    }

    const filePath = resolveLibraryFile("cifra", name);
    const text = await extractPdfText(readFileSync(filePath));

    return NextResponse.json({
      name,
      text
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Nao foi possivel abrir o PDF da pasta cifras." }, { status: 500 });
  }
}
