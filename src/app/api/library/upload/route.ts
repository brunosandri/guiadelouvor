import { NextResponse } from "next/server";
import { saveLibraryFile, type LibraryKind } from "@/lib/server-library";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const kind = formData.get("kind") as LibraryKind | null;
    const files = formData.getAll("files");

    if (kind !== "cifra" && kind !== "vs" && kind !== "resultado") {
      return NextResponse.json({ error: "Tipo de biblioteca invalido." }, { status: 400 });
    }

    const saved: string[] = [];
    for (const item of files) {
      if (!(item instanceof File)) continue;
      const buffer = Buffer.from(await item.arrayBuffer());
      saveLibraryFile(kind, item.name, buffer);
      saved.push(item.name);
    }

    return NextResponse.json({ saved });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Nao foi possivel salvar os arquivos." }, { status: 500 });
  }
}
