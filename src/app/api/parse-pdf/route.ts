import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf-extractor";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie um arquivo PDF válido." }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "O arquivo precisa ser um PDF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractPdfText(buffer);

    return NextResponse.json({
      text
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Não foi possível ler o PDF." }, { status: 500 });
  }
}
