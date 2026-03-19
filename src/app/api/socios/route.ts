import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSociosData } from "@/lib/data";

export async function GET() {
  await requireUser();
  const data = await getSociosData();
  return NextResponse.json({ data });
}
