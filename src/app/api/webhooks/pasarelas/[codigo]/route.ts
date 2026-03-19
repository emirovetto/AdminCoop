import { NextRequest, NextResponse } from "next/server";
import { finalizeExternalPayment } from "@/lib/automation-engine";
import {
  extractExternalReference,
  extractExternalStatus,
  extractInternalReference,
  normalizeExternalPaymentState,
} from "@/lib/payment-webhook";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ codigo: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { codigo } = await context.params;
  const pasarela = await prisma.pasarelaPago.findUnique({
    where: { codigo: codigo.toUpperCase() },
  });

  if (!pasarela) {
    return NextResponse.json({ error: "Pasarela no encontrada." }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido." }, { status: 400 });
  }

  const referenciaInterna = extractInternalReference(payload);
  const referenciaExterna = extractExternalReference(payload);
  const rawStatus = extractExternalStatus(payload);
  const nextState = normalizeExternalPaymentState(rawStatus);
  const token = request.headers.get("x-webhook-token");
  const firmaValida =
    pasarela.secretKeyMasked && token ? pasarela.secretKeyMasked === token : null;

  const pagoExterno = referenciaInterna
    ? await prisma.pagoExterno.findUnique({
        where: { referenciaInterna },
        select: { id: true },
      })
    : null;

  const webhook = await prisma.webhookPasarelaEvento.create({
    data: {
      pasarelaId: pasarela.id,
      pagoExternoId: pagoExterno?.id ?? null,
      tipoEvento: String(payload.type ?? payload.event ?? "evento_desconocido"),
      referenciaExterna,
      estado: "RECIBIDO",
      payloadJson: JSON.stringify(payload),
      firmaValida,
    },
  });

  let processed = false;
  let result: Record<string, unknown> = {
    webhookId: webhook.id,
    referenciaInterna,
    referenciaExterna,
    estadoExterno: rawStatus,
  };

  try {
    if (pasarela.confirmacionAutomatica && pagoExterno?.id && nextState) {
      const finalized = await finalizeExternalPayment({
        pagoExternoId: pagoExterno.id,
        estado: nextState,
        referenciaExterna,
        notasInternas: `Webhook ${webhook.id} recibido por API.`,
        actorId: null,
      });

      await prisma.webhookPasarelaEvento.update({
        where: { id: webhook.id },
        data: {
          estado: "PROCESADO",
          procesadoAt: new Date(),
        },
      });

      processed = true;
      result = {
        ...result,
        processed: true,
        ...finalized,
      };
    } else {
      await prisma.webhookPasarelaEvento.update({
        where: { id: webhook.id },
        data: {
          estado: "VALIDADO",
          procesadoAt: new Date(),
        },
      });
    }
  } catch (error) {
    await prisma.webhookPasarelaEvento.update({
      where: { id: webhook.id },
      data: {
        estado: "ERROR",
        errorDetalle: error instanceof Error ? error.message : "Fallo al procesar webhook.",
      },
    });

    return NextResponse.json(
      {
        ok: false,
        webhookId: webhook.id,
        error: error instanceof Error ? error.message : "Fallo al procesar webhook.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    processed,
    ...result,
  });
}
