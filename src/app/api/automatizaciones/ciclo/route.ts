import { NextRequest, NextResponse } from "next/server";
import { runAutomationCycle, verifyAutomationToken } from "@/lib/automation-engine";

export async function POST(request: NextRequest) {
  const token =
    request.headers.get("x-automation-token") ||
    request.nextUrl.searchParams.get("token");

  if (!verifyAutomationToken(token)) {
    return NextResponse.json({ error: "Token de automatizacion invalido." }, { status: 401 });
  }

  try {
    const result = await runAutomationCycle("API", null);
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo ejecutar el ciclo.",
      },
      { status: 500 },
    );
  }
}
