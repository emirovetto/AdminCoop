import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getApiAbonadosData } from "@/lib/data";

export async function GET() {
  await requireUser();
  const data = await getApiAbonadosData();
  return NextResponse.json({ data });
}
