import { jsPDF } from 'jspdf';

/**
 * Generates a real 3-page vector engineering blueprint PDF (A3 Landscape)
 * using jsPDF so pdfjs-dist renders authentic vector CAD plans out-of-the-box.
 */
export function generateSampleEngineeringPdfBytes(): Uint8Array {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a3',
  });

  const drawTitleBlock = (sheetCode: string, title: string, scaleText: string) => {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    // Outer frame
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1.5);
    doc.rect(24, 24, w - 48, h - 48);

    // Title block bottom-right
    doc.setFillColor(248, 250, 252);
    doc.rect(w - 300, h - 110, 276, 86, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('BUNYAN CORE SYSTEM · SHARJAH MUNICIPALITY', w - 290, h - 92);
    doc.setFontSize(11);
    doc.text(`${sheetCode} — ${title}`, w - 290, h - 72);
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`PROJECT: BNY-2026-001 | PLOT: 418-SHJ | ${scaleText}`, w - 290, h - 52);
    doc.text('CONSULTANT: DAR AL EMARAH ARCH. | PERMIT: SHJ-BP-2026-10842', w - 290, h - 36);

    // Scale Reference Bar (5.00m @ 1:100 = 141.73pt)
    const barLen = 141.73;
    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(2);
    doc.line(50, h - 50, 50 + barLen, h - 50);
    doc.line(50, h - 56, 50, h - 44);
    doc.line(50 + barLen, h - 56, 50 + barLen, h - 44);
    doc.setFontSize(8.5);
    doc.setTextColor(29, 78, 216);
    doc.text('5.00 m REFERENCE CALIBRATION BAR (1:100)', 50, h - 62);
  };

  // Page 1: A-101 Ground Floor Architectural Plan (1:100 => 1m = 28.3465 pt)
  const ppm = 28.3465;
  const ox = 160;
  const oy = 110;
  const villaW = 16 * ppm; // 16.0m
  const villaH = 12 * ppm; // 12.0m

  // Plot Boundary (24m x 18m)
  doc.setDrawColor(180, 134, 60);
  doc.setLineWidth(1);
  doc.rect(ox - 4 * ppm, oy - 2.5 * ppm, 24 * ppm, 18 * ppm);

  // Exterior Villa Walls
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(2.2);
  doc.rect(ox, oy, villaW, villaH);

  // Interior Partitions
  doc.setLineWidth(1.2);
  doc.line(ox, oy + 5 * ppm, ox + villaW, oy + 5 * ppm);
  doc.line(ox + 7 * ppm, oy, ox + 7 * ppm, oy + villaH);
  doc.line(ox + 11.5 * ppm, oy + 5 * ppm, ox + 11.5 * ppm, oy + villaH);

  // Room labels
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('MAJLIS (7.0m x 5.0m)', ox + 2 * ppm, oy + 2.6 * ppm);
  doc.text('FAMILY LIVING (9.0m x 5.0m)', ox + 9.5 * ppm, oy + 2.6 * ppm);
  doc.text('DINING & GUEST (7.0m x 7.0m)', ox + 1.8 * ppm, oy + 8.5 * ppm);
  doc.text('KITCHEN (4.5m x 7.0m)', ox + 7.8 * ppm, oy + 8.5 * ppm);
  doc.text('STAIR CORE', ox + 12.6 * ppm, oy + 8.5 * ppm);
  drawTitleBlock('A-101', 'GROUND FLOOR ARCHITECTURAL PLAN', 'SCALE 1:100');

  // Page 2: S-101 Structural Foundation & Column Grid
  doc.addPage('a3', 'landscape');
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.75);
  const xs = [0, 5.33, 10.66, 16];
  const ys = [0, 6, 12];
  for (const x of xs) {
    doc.line(ox + x * ppm, oy - 20, ox + x * ppm, oy + villaH + 20);
  }
  for (const y of ys) {
    doc.line(ox - 20, oy + y * ppm, ox + villaW + 20, oy + y * ppm);
  }
  doc.setDrawColor(15, 23, 42);
  doc.setFillColor(226, 232, 240);
  for (const x of xs) {
    for (const y of ys) {
      doc.rect(ox + x * ppm - 1 * ppm, oy + y * ppm - 1 * ppm, 2 * ppm, 2 * ppm, 'FD');
      doc.setFillColor(180, 134, 60);
      doc.rect(ox + x * ppm - 0.25 * ppm, oy + y * ppm - 0.25 * ppm, 0.5 * ppm, 0.5 * ppm, 'F');
      doc.setFillColor(226, 232, 240);
    }
  }
  drawTitleBlock('S-101', 'FOUNDATION & COLUMN GRID (C40 SRC)', 'SCALE 1:100');

  // Page 3: M-101 MEP & SEWA Layout
  doc.addPage('a3', 'landscape');
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(1.5);
  doc.rect(ox, oy, villaW, villaH);
  // Chilled Water Supply Duct
  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(1.5);
  doc.rect(ox + 1.5 * ppm, oy + 1.5 * ppm, 12 * ppm, 0.6 * ppm);
  // PPR Water Pipe
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(2);
  doc.line(ox - 1 * ppm, oy + 9.5 * ppm, ox + 10 * ppm, oy + 9.5 * ppm);
  doc.line(ox + 10 * ppm, oy + 9.5 * ppm, ox + 10 * ppm, oy + 6.5 * ppm);
  drawTitleBlock('M-101', 'MEP HVAC, PPR & UPVC DRAINAGE', 'SCALE 1:100');

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}
