import ExcelJS from "exceljs";

const CURRENCY_FMT = '"$"#,##0.00';

export async function renderInvoiceXlsx(invoiceData, outputPath) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice");

  const f = invoiceData.freelancer;

  // --- Header block: stacked label / value rows ---
  const headerRows = [
    ["Invoice", `#${invoiceData.invoiceNumber}`],
    ["From", f.name],
    ["Email", f.email],
    ["Phone", f.phone],
    ["Location", f.location],
    ["Bill To", invoiceData.client],
    ["Period", invoiceData.periodLabel],
    ["Date", invoiceData.generatedDate],
  ];
  for (const [label, value] of headerRows) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  ws.addRow([]); // spacer

  // --- Line-item table ---
  if (invoiceData.mode === "rate") {
    const head = ws.addRow(["Date", "Hours", "Description", "Amount"]);
    head.font = { bold: true };
    for (const e of invoiceData.entries) {
      const row = ws.addRow([e.date, e.hours, e.description, e.amount]);
      row.getCell(4).numFmt = CURRENCY_FMT;
    }
    const totals = ws.addRow(["Total", invoiceData.totalHours, "", invoiceData.totalAmount]);
    totals.getCell(1).font = { bold: true };
    totals.getCell(4).numFmt = CURRENCY_FMT;
    totals.getCell(4).font = { bold: true };
  } else {
    // fee mode
    if (invoiceData.includeHours && invoiceData.entries.length > 0) {
      const head = ws.addRow(["Date", "Hours", "Description"]);
      head.font = { bold: true };
      for (const e of invoiceData.entries) {
        ws.addRow([e.date, e.hours, e.description]);
      }
    }
    const totals = ws.addRow(["Total", "", invoiceData.totalAmount]);
    totals.getCell(1).font = { bold: true };
    totals.getCell(3).numFmt = CURRENCY_FMT;
    totals.getCell(3).font = { bold: true };
  }

  // --- Outstanding balance (only when > 0) ---
  if (invoiceData.outstandingBalance > 0) {
    const row = ws.addRow(["Outstanding Balance", "", invoiceData.outstandingBalance]);
    row.getCell(1).font = { bold: true };
    row.getCell(3).numFmt = CURRENCY_FMT;
  }

  // --- Payment terms (only when present) ---
  if (invoiceData.paymentTerms) {
    const row = ws.addRow(["Payment Terms", invoiceData.paymentTerms]);
    row.getCell(1).font = { bold: true };
  }

  // Column widths
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 40;
  ws.getColumn(4).width = 14;

  await wb.xlsx.writeFile(outputPath);
}
