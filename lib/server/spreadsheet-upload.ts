import "server-only";

const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 5_000;

const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];

export function validateSpreadsheetFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );

  if (!hasAllowedExtension) {
    return "Chỉ chấp nhận file Excel .xlsx hoặc .xls";
  }

  if (file.size === 0) return "File Excel rỗng";
  if (file.size > MAX_SPREADSHEET_BYTES) {
    return "File Excel không được vượt quá 5 MB";
  }

  return null;
}

export function validateSpreadsheetRows(rowCount: number): string | null {
  if (rowCount > MAX_SPREADSHEET_ROWS) {
    return `File Excel không được vượt quá ${MAX_SPREADSHEET_ROWS.toLocaleString("vi-VN")} dòng`;
  }

  return null;
}
