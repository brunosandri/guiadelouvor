import { NextResponse } from "next/server";
import { getLibraryStatus } from "@/lib/server-library";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    libraries: getLibraryStatus()
  });
}
