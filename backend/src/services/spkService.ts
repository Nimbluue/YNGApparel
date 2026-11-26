import path from 'node:path';
import {
  FULFILLMENT_TYPE,
  PRINT_POSITION_LABELS,
  getDesignStatusLabel,
  getFulfillmentLabel,
  getProductionStatusLabel,
} from '@yng/shared';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import type { OrderDetailRecord } from '../models/orderModel.js';
import { maskLocationSummary } from '../utils/masking.js';

const RASTER_DESIGN_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function formatWibDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date) + ' WIB'
  );
}

function formatWibDate(value: Date | string | null): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

async function resolvePrintableImageBuffer(
  filePath: string | null,
  downloadDesign?: (filePath: string) => Promise<Buffer>
): Promise<Buffer | null> {
  if (!filePath || !downloadDesign) return null;
  const ext = path.posix.extname(filePath).toLowerCase();
  if (!RASTER_DESIGN_EXTENSIONS.has(ext)) {
    return null;
  }

  try {
    const raw = await downloadDesign(filePath);
    // Normalisasi ke JPEG non-progressive agar PDFKit aman merender gambar interlaced/alpha/CMYK.
    return await sharp(raw)
      .rotate()
      .flatten({ background: '#FFFFFF' })
      .jpeg({ quality: 90, progressive: false })
      .toBuffer();
  } catch (err: unknown) {
    console.warn('[SpkService] Gagal memuat pratinjau desain untuk SPK PDF:', err);
    return null;
  }
}

/**
 * Menghasilkan buffer PDF Surat Perintah Kerja (SPK) A4 untuk kebutuhan workshop produksi.
 * Sesuai SPEC 6.9, SPK tidak pernah memuat nominal harga apa pun.
 */
export async function generateSpkPdfBuffer(
  record: OrderDetailRecord,
  downloadDesign?: (filePath: string) => Promise<Buffer>
): Promise<Buffer> {
  const { order, items, itemSizes, itemPrints } = record;

  const sizesByItem = new Map<number, typeof itemSizes>();
  for (const s of itemSizes) {
    const list = sizesByItem.get(s.order_item_id) ?? [];
    list.push(s);
    sizesByItem.set(s.order_item_id, list);
  }

  const printsByItem = new Map<number, typeof itemPrints>();
  for (const p of itemPrints) {
    const list = printsByItem.get(p.order_item_id) ?? [];
    list.push(p);
    printsByItem.set(p.order_item_id, list);
  }

  const imageBuffers = new Map<number, Buffer>();
  for (const print of itemPrints) {
    if (print.raw_design_file_path) {
      const imgBuf = await resolvePrintableImageBuffer(print.raw_design_file_path, downloadDesign);
      if (imgBuf) {
        imageBuffers.set(print.id, imgBuf);
      }
    }
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `SPK ${order.order_code} - YNG Apparel`,
        Author: 'YNG Apparel Workshop',
      },
    });

    const chunks: Buffer[] = [];
    let settled = false;

    doc.on('data', (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on('end', () => {
      if (settled) return;
      settled = true;
      const pdfBuffer = Buffer.concat(chunks);
      if (pdfBuffer.length === 0 || pdfBuffer.subarray(0, 5).toString('utf8') !== '%PDF-') {
        reject(new Error('Output SPK PDF tidak memiliki header %PDF- yang valid.'));
        return;
      }
      resolve(pdfBuffer);
    });
    doc.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    try {
      const contentWidth = doc.page.width - 80;
      const ensureSpace = (neededHeight: number) => {
        if (doc.y + neededHeight > doc.page.height - 50) {
          doc.addPage();
        }
      };

      // Header
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#111111');
      doc.text('YNG APPAREL — SURAT PERINTAH KERJA (SPK)', { width: contentWidth });
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor('#555555');
      doc.text(
        `Kode Order: ${order.order_code}   |   Tanggal Order: ${formatWibDateTime(order.created_at)}   |   Total Qty: ${order.total_qty} pcs`
      );

      doc.moveDown(0.5);
      doc
        .moveTo(40, doc.y)
        .lineTo(40 + contentWidth, doc.y)
        .lineWidth(1)
        .strokeColor('#111111')
        .stroke();
      doc.moveDown(0.6);

      // Info Pelanggan & Pengiriman
      const destination =
        order.fulfillment_type === FULFILLMENT_TYPE.PICKUP
          ? 'Ambil di Workshop (Batam)'
          : `${getFulfillmentLabel(order.fulfillment_type)}${maskLocationSummary(order.city_name, order.province_name) ? ` — ${maskLocationSummary(order.city_name, order.province_name)}` : ''}`;

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('RINGKASAN PRODUKSI');
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(9.5).fillColor('#222222');
      doc.text(`Pelanggan     : ${order.customer_name} (${order.customer_whatsapp})`);
      doc.text(`Pengiriman    : ${destination}`);
      doc.text(
        `Status Order  : ${getProductionStatusLabel(order.production_status, order.fulfillment_type)}   |   Desain: ${getDesignStatusLabel(order.design_status)}`
      );
      doc.text(`Target Selesai: ${formatWibDate(order.estimated_finish_date)}`);

      if (order.design_review_notes) {
        doc.moveDown(0.25);
        doc.text(`Catatan Desain: ${order.design_review_notes}`);
      }
      if (order.admin_notes) {
        doc.moveDown(0.25);
        doc.text(`Catatan Admin : ${order.admin_notes}`);
      }

      doc.moveDown(0.8);

      // Daftar Item Produksi
      items.forEach((item, index) => {
        ensureSpace(140);
        const sizes = sizesByItem.get(item.id) ?? [];
        const prints = printsByItem.get(item.id) ?? [];

        doc.rect(40, doc.y, contentWidth, 22).fillColor('#F5F5F5').fill();

        const headerY = doc.y + 6;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111');
        doc.text(`ITEM #${index + 1}: ${item.model_name} (${item.item_qty} pcs)`, 48, headerY, {
          width: contentWidth - 16,
        });
        doc.y = headerY + 20;

        doc.font('Helvetica').fontSize(9.5).fillColor('#222222');
        const customBadge = item.is_custom_color ? ' [WARNA CUSTOM — KONFIRMASI STOK]' : '';
        doc.text(
          `Bahan: ${item.fabric_name}   |   Warna: ${item.color_name}${item.color_hex ? ` (${item.color_hex})` : ''}${customBadge}`,
          48,
          doc.y,
          { width: contentWidth - 16 }
        );
        doc.moveDown(0.3);

        const sizeText = sizes.map((s) => `${s.size_code}: ${s.qty} pcs`).join('   •   ');
        doc.font('Helvetica-Bold').text('Matriks Ukuran: ', 48, doc.y, { continued: true });
        doc.font('Helvetica').text(sizeText || '-');
        doc.moveDown(0.3);

        if (prints.length === 0) {
          doc.text('Titik Sablon  : Polos (tanpa sablon)', 48);
        } else {
          doc.font('Helvetica-Bold').text(`Titik Sablon (${prints.length}):`, 48);
          doc.moveDown(0.2);

          for (const print of prints) {
            ensureSpace(75);
            const posLabel = PRINT_POSITION_LABELS[print.print_position] ?? print.print_position;
            const fileLabel = print.raw_design_file_path
              ? (print.design_file_name ?? path.posix.basename(print.raw_design_file_path))
              : 'Bantuan Desain Gratis (cek WA/admin)';

            doc.font('Helvetica').fontSize(9).fillColor('#222222');
            doc.text(`• ${posLabel} (${print.print_size_code}) — File: ${fileLabel}`, 56, doc.y, {
              width: contentWidth - 24,
            });

            const imgBuf = imageBuffers.get(print.id);
            if (imgBuf) {
              try {
                ensureSpace(85);
                doc.moveDown(0.2);
                doc.image(imgBuf, 64, doc.y, { fit: [110, 70] });
                doc.y += 74;
              } catch {
                // Abaikan jika format buffer gambar tidak dapat dirender oleh pdfkit
              }
            }
          }
        }

        if (item.production_notes) {
          doc.moveDown(0.25);
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .text('Catatan Item  : ', 48, doc.y, { continued: true });
          doc.font('Helvetica').text(item.production_notes, { width: contentWidth - 90 });
        }

        doc.moveDown(0.7);
      });

      doc.end();
    } catch (err: unknown) {
      if (!settled) {
        settled = true;
        reject(err instanceof Error ? err : new Error('Gagal membuat dokumen SPK PDF.'));
      }
    }
  });
}
