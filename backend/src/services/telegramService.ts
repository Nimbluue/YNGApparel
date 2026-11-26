import {
  getFulfillmentLabel,
  getPaymentSchemeLabel,
  type FulfillmentType,
  type OrderSource,
  type PaymentMethod,
  type PaymentScheme,
  type Rupiah,
} from '@yng/shared';
import { env } from '../config/env.js';

export interface TelegramServiceDeps {
  botToken?: string;
  chatId?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface TelegramSendResult {
  sent: boolean;
  skipped?: boolean;
  error?: string;
}

function formatRupiahPlain(amount: Rupiah): string {
  const value = Math.round(Number(amount) || 0);
  return `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;
}

/**
 * Service notifikasi Telegram opsional untuk admin YNG Apparel.
 * Aman bila token bot / chat ID tidak dikonfigurasi (no-op) dan tidak pernah melempar error ke alur utama.
 */
export function createTelegramService(deps: TelegramServiceDeps = {}) {
  const botToken = (deps.botToken ?? env.telegramBotToken).trim();
  const chatId = (deps.chatId ?? env.telegramChatId).trim();
  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 5000;

  function isConfigured(): boolean {
    return Boolean(botToken && chatId);
  }

  async function sendMessage(text: string): Promise<TelegramSendResult> {
    if (!isConfigured()) {
      return { sent: false, skipped: true };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorMsg = `HTTP ${response.status} dari Telegram API`;
        console.warn(`[TelegramService] Gagal mengirim notifikasi: ${errorMsg}`);
        return { sent: false, error: errorMsg };
      }

      return { sent: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[TelegramService] Error mengirim notifikasi Telegram: ${errorMsg}`);
      return { sent: false, error: errorMsg };
    } finally {
      clearTimeout(timer);
    }
  }

  async function notifyNewOrder(input: {
    orderCode: string;
    source: OrderSource;
    customerName: string;
    totalQty: number;
    grandTotal: Rupiah;
    paymentScheme: PaymentScheme;
    dpPercentSnapshot?: number | null;
    fulfillmentType: FulfillmentType;
  }): Promise<TelegramSendResult> {
    // Sesuai SPEC Bagian 13: notifikasi Telegram tidak memuat alamat lengkap atau nomor HP sensitif
    const lines = [
      `Order Baru #${input.orderCode} (${input.source})`,
      `Pemesan: ${input.customerName}`,
      `Qty: ${input.totalQty} pcs · ${getFulfillmentLabel(input.fulfillmentType)}`,
      `Skema: ${getPaymentSchemeLabel(input.paymentScheme, input.dpPercentSnapshot ?? null)}`,
      `Total: ${formatRupiahPlain(input.grandTotal)}`,
    ];
    return sendMessage(lines.join('\n'));
  }

  async function notifyPaymentProofUploaded(input: {
    orderCode: string;
    paymentStageLabel: string;
    amount: Rupiah;
    paymentMethod: PaymentMethod | null;
  }): Promise<TelegramSendResult> {
    const lines = [
      `Bukti Bayar Masuk #${input.orderCode}`,
      `Tahap: ${input.paymentStageLabel}`,
      `Nominal: ${formatRupiahPlain(input.amount)}`,
      `Metode: ${input.paymentMethod ?? '-'}`,
    ];
    return sendMessage(lines.join('\n'));
  }

  return {
    isConfigured,
    sendMessage,
    notifyNewOrder,
    notifyPaymentProofUploaded,
  };
}

export type TelegramService = ReturnType<typeof createTelegramService>;

export const telegramService = createTelegramService();

export default telegramService;
