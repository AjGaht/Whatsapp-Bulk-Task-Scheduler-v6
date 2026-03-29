import { parsePhoneNumberFromString } from "libphonenumber-js";

/** ISO 3166-1 alpha-2 for Baileys `countryCode` (must match the WhatsApp account’s region). */
export function isoCountryFromDigits(digits: string): string {
  if (!digits) return "US";
  try {
    const pn = parsePhoneNumberFromString(`+${digits}`);
    if (pn?.country) return pn.country;
  } catch {
    /* invalid */
  }
  return "US";
}
