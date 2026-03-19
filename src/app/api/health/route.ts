import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      app: "AdminCoop",
      database: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        app: "AdminCoop",
        database: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown database error",
      },
      { status: 500 },
    );
  }
}
