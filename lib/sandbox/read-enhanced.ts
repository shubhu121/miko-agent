

import { readFile as fsReadFile } from "fs/promises";
import { extname } from "path";



const XLSX_SUMMARY_ROW_THRESHOLD = 100;
const XLSX_SUMMARY_COLUMN_THRESHOLD = 30;
const XLSX_SUMMARY_CELL_THRESHOLD = 3000;
const XLSX_COLUMNS_PER_TEXT_LINE = 30;
const XLSX_SHEET_LIMIT = 8;
const XLSX_DISPLAY_CELL_WIDTH = 40;

function normalizeXlsxCellText(cell) {
  return String(cell.text ?? "").replace(/[\t\r\n]+/g, " ");
}

function shouldSummarizeSheet(sheet) {
  const rows = sheet.rowCount;
  const columns = sheet.columnCount;
  return (
    rows > XLSX_SUMMARY_ROW_THRESHOLD ||
    columns > XLSX_SUMMARY_COLUMN_THRESHOLD ||
    rows * columns > XLSX_SUMMARY_CELL_THRESHOLD
  );
}

function collectXlsxColumnWidths(sheet) {
  const widths = new Array(sheet.columnCount).fill(0);
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const len = normalizeXlsxCellText(row.getCell(c)).length;
      if (len > widths[c - 1]) widths[c - 1] = Math.min(len, XLSX_DISPLAY_CELL_WIDTH);
    }
  }
  return widths;
}

function formatXlsxCell(cell, width) {
  if (width <= 0) return "";
  return cell.length > width ? cell.slice(0, width - 1) + "…" : cell.padEnd(width);
}

function formatXlsxSheetRows(sheet) {
  const lines = [];
  const colWidths = collectXlsxColumnWidths(sheet);
  const splitColumns = sheet.columnCount > XLSX_COLUMNS_PER_TEXT_LINE;

  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;

    for (let start = 1; start <= sheet.columnCount; start += XLSX_COLUMNS_PER_TEXT_LINE) {
      const end = Math.min(sheet.columnCount, start + XLSX_COLUMNS_PER_TEXT_LINE - 1);
      const cells = [];
      for (let c = start; c <= end; c += 1) {
        cells.push(formatXlsxCell(
          normalizeXlsxCellText(row.getCell(c)),
          colWidths[c - 1] || 0,
        ));
      }
      const text = cells.join(" | ");
      lines.push(splitColumns ? `R${r} C${start}-${end}: ${text}` : text);
    }
  }

  return lines;
}

async function xlsxToText(filePath) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const parts = [];
  const sheets = workbook.worksheets.slice(0, XLSX_SHEET_LIMIT);
  for (const sheet of sheets) {
    if (sheet.rowCount === 0) continue;
    parts.push(`[Sheet: ${sheet.name}]`);

    if (shouldSummarizeSheet(sheet)) {
      parts.push(`Rows: ${sheet.rowCount}`);
      parts.push(`Columns: ${sheet.columnCount}`);
    }
    parts.push(...formatXlsxSheetRows(sheet));
    parts.push("");
  }

  if (workbook.worksheets.length > XLSX_SHEET_LIMIT) {
    parts.push(`[Workbook truncated: showing ${XLSX_SHEET_LIMIT}/${workbook.worksheets.length} sheets]`);
  }

  return parts.join("\n");
}



async function docxToText(filePath) {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}




function isValidUtf8(buffer) {
  
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return true;

  
  let hasHighByte = false;
  for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
    if (buffer[i] > 0x7F) { hasHighByte = true; break; }
  }
  if (!hasHighByte) return true;

  
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function decodeBuffer(buffer) {
  if (isValidUtf8(buffer)) {
    
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return buffer.subarray(3).toString("utf-8");
    }
    return buffer.toString("utf-8");
  }
  
  try {
    return new TextDecoder("gbk").decode(buffer);
  } catch {
    // fallback
    return buffer.toString("utf-8");
  }
}



const XLSX_EXTS = new Set([".xlsx"]); 
const DOCX_EXTS = new Set([".docx"]); 
const TEXT_LIKE_EXTS = new Set([
  ".csv", ".tsv", ".txt", ".log", ".md", ".json", ".xml", ".html", ".htm",
  ".yaml", ".yml", ".ini", ".cfg", ".conf", ".properties",
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".cs",
  ".go", ".rs", ".rb", ".php", ".sh", ".bat", ".ps1", ".sql",
]);


export function createEnhancedReadFile() {
  return async (absolutePath) => {
    const ext = extname(absolutePath).toLowerCase();

    
    if (XLSX_EXTS.has(ext)) {
      try {
        const text = await xlsxToText(absolutePath);
        return Buffer.from(text, "utf-8");
      } catch (err) {
        
        const { t } = await import("../i18n.ts");
        return Buffer.from(`[${t("error.xlsxParseFailed", { ext, msg: err.message })}]`, "utf-8");
      }
    }

    
    if (DOCX_EXTS.has(ext)) {
      try {
        const text = await docxToText(absolutePath);
        return Buffer.from(text, "utf-8");
      } catch (err) {
        const { t } = await import("../i18n.ts");
        return Buffer.from(`[${t("error.docxParseFailed", { ext, msg: err.message })}]`, "utf-8");
      }
    }

    
    const buffer = await fsReadFile(absolutePath);

    
    if (TEXT_LIKE_EXTS.has(ext) || !ext) {
      const decoded = decodeBuffer(buffer);
      return Buffer.from(decoded, "utf-8");
    }

    
    return buffer;
  };
}
