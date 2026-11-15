import "server-only";
import { createAsaas, type Asaas } from "@/lib/asaas/http";

export const hasAsaasKey = () => Boolean(process.env.ASAAS_API_KEY);
export const hasWebhookToken = () => Boolean(process.env.ASAAS_WEBHOOK_TOKEN);

/** Cliente do Asaas com a chave da Vercel. ASAAS_BASE_URL permite apontar para o sandbox. */
export function asaasFromEnv(): Asaas {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");
  return createAsaas({ apiKey, baseUrl: process.env.ASAAS_BASE_URL });
}
