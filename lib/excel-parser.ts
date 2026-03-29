import * as XLSX from "xlsx";

export interface Contact {
  phone: string;
  rawPhone: string;
  isValid: boolean;
  row: number;
}

export interface ParseResult {
  contacts: Contact[];
  columns: string[];
  validCount: number;
  invalidCount: number;
  phoneColumn: string;
}

function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  const stripped = String(raw).trim().replace(/[\s\-().]/g, "");
  // Ensure + prefix if starts with digits only
  if (/^\d/.test(stripped)) return "+" + stripped;
  return stripped;
}

function isValidPhone(phone: string): boolean {
  // Must be + followed by 7–15 digits
  return /^\+\d{7,15}$/.test(phone);
}

function detectPhoneColumn(headers: string[]): string {
  const candidates = ["phone", "mobile", "number", "tel", "whatsapp", "wa", "contact"];
  for (const h of headers) {
    if (candidates.some((c) => h.toLowerCase().includes(c))) return h;
  }
  return headers[0] ?? "";
}

export async function parseExcelFile(
  file: File,
  phoneColumnOverride?: string
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });

  if (rows.length === 0) throw new Error("The file appears to be empty.");

  const columns = Object.keys(rows[0]);
  const phoneColumn = phoneColumnOverride || detectPhoneColumn(columns);

  const contacts: Contact[] = rows.map((row, idx) => {
    const rawPhone = String(row[phoneColumn] ?? "").trim();
    const phone = normalizePhone(rawPhone);
    return {
      phone,
      rawPhone,
      isValid: isValidPhone(phone),
      row: idx + 2, // 1-indexed, +1 for header row
    };
  });

  return {
    contacts,
    columns,
    phoneColumn,
    validCount: contacts.filter((c) => c.isValid).length,
    invalidCount: contacts.filter((c) => !c.isValid).length,
  };
}
