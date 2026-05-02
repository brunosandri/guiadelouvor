import { NextResponse } from "next/server";
import pdf from "pdf-parse";

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
    const parsed = await pdf(buffer);

    return NextResponse.json({
      text: parsed.text.replace(/\n{3,}/g, "\n\n")
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Não foi possível ler o PDF." }, { status: 500 });
  }
}
