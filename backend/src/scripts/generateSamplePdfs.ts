import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function generateSamplePdfs() {
  const outputDir = path.resolve(__dirname, '../../../sample-data/invoices');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // --------------------------------------------------------------------------
  // 1. INV-101.pdf (Demo Scenario Invoice)
  // --------------------------------------------------------------------------
  const pdf1 = await PDFDocument.create();
  const font1 = await pdf1.embedFont(StandardFonts.Helvetica);
  const fontBold1 = await pdf1.embedFont(StandardFonts.HelveticaBold);
  const page1 = pdf1.addPage([595.28, 841.89]); // A4
  const { width: w1, height: h1 } = page1.getSize();

  // Watermark / Sample Banner
  page1.drawText('SAMPLE DATA - PROTOTYPE DEMONSTRATION ONLY', {
    x: 120,
    y: h1 - 25,
    size: 10,
    font: fontBold1,
    color: rgb(0.85, 0.45, 0.1)
  });

  // Header
  page1.drawText('TAX INVOICE', { x: 40, y: h1 - 60, size: 20, font: fontBold1, color: rgb(0.1, 0.2, 0.4) });
  page1.drawText('TimberCraft Woodworks (Supplier A)', { x: 40, y: h1 - 85, size: 14, font: fontBold1 });
  page1.drawText('GSTIN: 27AAACT1234A1Z5   |   PAN: AAACT1234A', { x: 40, y: h1 - 102, size: 10, font: font1 });
  page1.drawText('Address: Plot 42, Wood Processing Zone, Pune, Maharashtra 411001', { x: 40, y: h1 - 117, size: 9, font: font1, color: rgb(0.3, 0.3, 0.3) });
  page1.drawText('Bank Account / IFSC: HDFC0001234-9876543210 (HDFC Bank)', { x: 40, y: h1 - 132, size: 9, font: font1, color: rgb(0.3, 0.3, 0.3) });

  // Meta box
  page1.drawRectangle({ x: 340, y: h1 - 145, width: 215, height: 85, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1, color: rgb(0.97, 0.98, 1.0) });
  page1.drawText('Invoice Number: INV-101', { x: 350, y: h1 - 80, size: 11, font: fontBold1 });
  page1.drawText('Invoice Date: 2026-11-08', { x: 350, y: h1 - 98, size: 10, font: font1 });
  page1.drawText('PO Reference: PO-101', { x: 350, y: h1 - 116, size: 10, font: fontBold1, color: rgb(0.1, 0.4, 0.7) });
  page1.drawText('IRN: 3b48f9361adce6e7194f4a3e9819ec417a8c3d97f1f0a3592bc1784918e9c402', { x: 350, y: h1 - 134, size: 6, font: font1, color: rgb(0.4, 0.4, 0.4) });

  // Billed To
  page1.drawText('Billed To (Buyer):', { x: 40, y: h1 - 170, size: 10, font: fontBold1 });
  page1.drawText('ABC Manufacturing (sample)', { x: 40, y: h1 - 185, size: 12, font: fontBold1 });
  page1.drawText('GSTIN: 27AAACA1234A1Z1   |   State: Maharashtra (Code: 27)', { x: 40, y: h1 - 200, size: 9, font: font1 });

  // Line items table
  page1.drawRectangle({ x: 40, y: h1 - 240, width: 515, height: 25, color: rgb(0.15, 0.25, 0.45) });
  page1.drawText('Description', { x: 50, y: h1 - 232, size: 10, font: fontBold1, color: rgb(1, 1, 1) });
  page1.drawText('Quantity', { x: 260, y: h1 - 232, size: 10, font: fontBold1, color: rgb(1, 1, 1) });
  page1.drawText('Unit Price', { x: 340, y: h1 - 232, size: 10, font: fontBold1, color: rgb(1, 1, 1) });
  page1.drawText('Tax Rate', { x: 420, y: h1 - 232, size: 10, font: fontBold1, color: rgb(1, 1, 1) });
  page1.drawText('Total (INR)', { x: 490, y: h1 - 232, size: 10, font: fontBold1, color: rgb(1, 1, 1) });

  // Item row
  page1.drawText('Teak Wood 100kg (Sample Wood)', { x: 50, y: h1 - 265, size: 10, font: font1 });
  page1.drawText('100.00 kg', { x: 260, y: h1 - 265, size: 10, font: font1 });
  page1.drawText('Rs 500.00', { x: 340, y: h1 - 265, size: 10, font: font1 });
  page1.drawText('18.00%', { x: 420, y: h1 - 265, size: 10, font: font1 });
  page1.drawText('50,000.00', { x: 495, y: h1 - 265, size: 10, font: font1 });

  page1.drawLine({ start: { x: 40, y: h1 - 280 }, end: { x: 555, y: h1 - 280 }, color: rgb(0.85, 0.85, 0.85) });

  // Totals Box
  const totalsY = h1 - 320;
  page1.drawText('Subtotal:', { x: 380, y: totalsY, size: 10, font: font1 });
  page1.drawText('Rs 50,000.00', { x: 480, y: totalsY, size: 10, font: font1 });

  page1.drawText('CGST (9.0%):', { x: 380, y: totalsY - 18, size: 10, font: font1 });
  page1.drawText('Rs 4,500.00', { x: 480, y: totalsY - 18, size: 10, font: font1 });

  page1.drawText('SGST (9.0%):', { x: 380, y: totalsY - 36, size: 10, font: font1 });
  page1.drawText('Rs 4,500.00', { x: 480, y: totalsY - 36, size: 10, font: font1 });

  page1.drawText('IGST (0.0%):', { x: 380, y: totalsY - 54, size: 10, font: font1 });
  page1.drawText('Rs 0.00', { x: 480, y: totalsY - 54, size: 10, font: font1 });

  page1.drawRectangle({ x: 370, y: totalsY - 85, width: 185, height: 24, color: rgb(0.92, 0.96, 1.0) });
  page1.drawText('Total Amount:', { x: 380, y: totalsY - 78, size: 11, font: fontBold1, color: rgb(0.1, 0.3, 0.6) });
  page1.drawText('Rs 59,000.00', { x: 480, y: totalsY - 78, size: 11, font: fontBold1, color: rgb(0.1, 0.3, 0.6) });

  // Footer notes
  page1.drawText('Terms & Conditions: Payment due within 30 days. E-invoice authenticated via GSTN Portal.', {
    x: 40,
    y: 60,
    size: 8,
    font: font1,
    color: rgb(0.5, 0.5, 0.5)
  });

  const pdf1Bytes = await pdf1.save();
  fs.writeFileSync(path.join(outputDir, 'INV-101.pdf'), pdf1Bytes);
  console.log('✓ Generated sample-data/invoices/INV-101.pdf');

  // --------------------------------------------------------------------------
  // 2. INV-HIST-01.pdf (Historical Invoice with Extra Surcharge)
  // --------------------------------------------------------------------------
  const pdf2 = await PDFDocument.create();
  const font2 = await pdf2.embedFont(StandardFonts.Helvetica);
  const fontBold2 = await pdf2.embedFont(StandardFonts.HelveticaBold);
  const page2 = pdf2.addPage([595.28, 841.89]);
  const { width: w2, height: h2 } = page2.getSize();

  page2.drawText('SAMPLE DATA - PROTOTYPE DEMONSTRATION ONLY', { x: 120, y: h2 - 25, size: 10, font: fontBold2, color: rgb(0.85, 0.45, 0.1) });
  page2.drawText('TAX INVOICE', { x: 40, y: h2 - 60, size: 20, font: fontBold2, color: rgb(0.1, 0.2, 0.4) });
  page2.drawText('TimberCraft Woodworks (Supplier A)', { x: 40, y: h2 - 85, size: 14, font: fontBold2 });
  page2.drawText('GSTIN: 27AAACT1234A1Z5   |   PAN: AAACT1234A', { x: 40, y: h2 - 102, size: 10, font: font2 });
  page2.drawText('Bank Account / IFSC: HDFC0001234-9876543210', { x: 40, y: h2 - 117, size: 9, font: font2 });

  page2.drawRectangle({ x: 340, y: h2 - 135, width: 215, height: 75, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1, color: rgb(0.97, 0.98, 1.0) });
  page2.drawText('Invoice Number: INV-HIST-01', { x: 350, y: h2 - 80, size: 11, font: fontBold2 });
  page2.drawText('Invoice Date: 2026-05-10', { x: 350, y: h2 - 98, size: 10, font: font2 });
  page2.drawText('PO Reference: PO-HIST-88', { x: 350, y: h2 - 116, size: 10, font: fontBold2 });

  page2.drawText('Billed To: ABC Manufacturing (sample)   GSTIN: 27AAACA1234A1Z1', { x: 40, y: h2 - 165, size: 10, font: fontBold2 });

  page2.drawRectangle({ x: 40, y: h2 - 210, width: 515, height: 25, color: rgb(0.2, 0.3, 0.4) });
  page2.drawText('Description', { x: 50, y: h2 - 202, size: 10, font: fontBold2, color: rgb(1, 1, 1) });
  page2.drawText('Qty', { x: 260, y: h2 - 202, size: 10, font: fontBold2, color: rgb(1, 1, 1) });
  page2.drawText('Rate', { x: 340, y: h2 - 202, size: 10, font: fontBold2, color: rgb(1, 1, 1) });
  page2.drawText('Tax', { x: 420, y: h2 - 202, size: 10, font: fontBold2, color: rgb(1, 1, 1) });
  page2.drawText('Total (INR)', { x: 490, y: h2 - 202, size: 10, font: fontBold2, color: rgb(1, 1, 1) });

  page2.drawText('Timber Raw Logs (Sample Data)', { x: 50, y: h2 - 235, size: 10, font: font2 });
  page2.drawText('80.00 kg', { x: 260, y: h2 - 235, size: 10, font: font2 });
  page2.drawText('Rs 500.00', { x: 340, y: h2 - 235, size: 10, font: font2 });
  page2.drawText('18.00%', { x: 420, y: h2 - 235, size: 10, font: font2 });
  page2.drawText('40,000.00', { x: 495, y: h2 - 235, size: 10, font: font2 });

  page2.drawText('Handling Surcharge (Repeated Extra Charge)', { x: 50, y: h2 - 260, size: 10, font: font2, color: rgb(0.8, 0.2, 0.1) });
  page2.drawText('1.00 unit', { x: 260, y: h2 - 260, size: 10, font: font2 });
  page2.drawText('Rs 500.00', { x: 340, y: h2 - 260, size: 10, font: font2 });
  page2.drawText('18.00%', { x: 420, y: h2 - 260, size: 10, font: font2 });
  page2.drawText('500.00', { x: 505, y: h2 - 260, size: 10, font: font2 });

  page2.drawLine({ start: { x: 40, y: h2 - 280 }, end: { x: 555, y: h2 - 280 }, color: rgb(0.85, 0.85, 0.85) });

  const totalsY2 = h2 - 320;
  page2.drawText('Subtotal: Rs 40,500.00', { x: 420, y: totalsY2, size: 10, font: font2 });
  page2.drawText('CGST (9%): Rs 3,645.00', { x: 420, y: totalsY2 - 18, size: 10, font: font2 });
  page2.drawText('SGST (9%): Rs 3,645.00', { x: 420, y: totalsY2 - 36, size: 10, font: font2 });
  page2.drawText('Total Amount: Rs 47,790.00', { x: 410, y: totalsY2 - 60, size: 11, font: fontBold2, color: rgb(0.1, 0.3, 0.6) });

  const pdf2Bytes = await pdf2.save();
  fs.writeFileSync(path.join(outputDir, 'INV-HIST-01.pdf'), pdf2Bytes);
  console.log('✓ Generated sample-data/invoices/INV-HIST-01.pdf');

  // --------------------------------------------------------------------------
  // 3. INV-SCAN-01.pdf (Deliberately Lower Quality / Scanned Look / Missing PO)
  // --------------------------------------------------------------------------
  const pdf3 = await PDFDocument.create();
  const font3 = await pdf3.embedFont(StandardFonts.Courier);
  const fontBold3 = await pdf3.embedFont(StandardFonts.CourierBold);
  const page3 = pdf3.addPage([595.28, 841.89]);
  const { width: w3, height: h3 } = page3.getSize();

  // Faint grainy background to simulate scan
  page3.drawRectangle({
    x: 0,
    y: 0,
    width: w3,
    height: h3,
    color: rgb(0.98, 0.98, 0.96)
  });

  page3.drawText('** SCANNED VENDOR INVOICE - LOW RESOLUTION **', {
    x: 90,
    y: h3 - 35,
    size: 11,
    font: fontBold3,
    color: rgb(0.6, 0.3, 0.1)
  });

  // Slightly offset and faded text
  page3.drawText('COMMERCIAL BILL / INVOICE', { x: 50, y: h3 - 75, size: 16, font: fontBold3, color: rgb(0.2, 0.2, 0.2) });
  page3.drawText('Supplier: TimberCraft Woodworks', { x: 50, y: h3 - 100, size: 12, font: fontBold3 });
  page3.drawText('GSTIN: 27AAACT1234A1Z5', { x: 50, y: h3 - 118, size: 10, font: font3 });
  // Intentionally omitted / missing PO Reference and blurred tax breakdown
  page3.drawText('Invoice Number: INV-SCAN-01', { x: 340, y: h3 - 100, size: 11, font: fontBold3 });
  page3.drawText('Date: 2026-10-15', { x: 340, y: h3 - 118, size: 10, font: font3 });
  page3.drawText('PO Ref: [NOT SPECIFIED / UNREADABLE ON SCAN]', { x: 340, y: h3 - 136, size: 8, font: font3, color: rgb(0.7, 0.2, 0.2) });

  page3.drawText('Bill To: ABC Manufacturing (sample)', { x: 50, y: h3 - 165, size: 11, font: font3 });
  page3.drawText('Item: Sawn Hardwood Timber Logs', { x: 50, y: h3 - 220, size: 10, font: font3 });
  page3.drawText('Qty: 50.00 kg  @ Rs 500/kg', { x: 50, y: h3 - 240, size: 10, font: font3 });
  page3.drawText('Subtotal: Rs 25,000.00', { x: 50, y: h3 - 260, size: 10, font: font3 });
  page3.drawText('Tax (CGST+SGST 18%): Rs 4,500.00', { x: 50, y: h3 - 280, size: 10, font: font3 });
  page3.drawText('Total Payable: Rs 29,500.00', { x: 50, y: h3 - 310, size: 12, font: fontBold3, color: rgb(0.1, 0.1, 0.4) });

  page3.drawText('[Note: Scanned copy submitted without formal PO purchase requisition stamp]', {
    x: 50,
    y: h3 - 360,
    size: 8,
    font: font3,
    color: rgb(0.5, 0.5, 0.5)
  });

  const pdf3Bytes = await pdf3.save();
  fs.writeFileSync(path.join(outputDir, 'INV-SCAN-01.pdf'), pdf3Bytes);
  console.log('✓ Generated sample-data/invoices/INV-SCAN-01.pdf (low quality/missing PO)');
}

generateSamplePdfs().catch(console.error);
