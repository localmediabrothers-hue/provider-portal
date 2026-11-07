/**
 * A free WhatsApp "click to chat" link - no account, no API, no cost.
 * Opens WhatsApp with the right person and the message already typed in;
 * whoever clicks it still has to press send themselves.
 */
export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${toInternational(phone)}?text=${encodeURIComponent(message)}`;
}

/** UK numbers are usually entered as "07123 456789" - wa.me needs "447123456789". */
function toInternational(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("44")) return digits;
  if (digits.startsWith("0")) return "44" + digits.slice(1);
  return "44" + digits;
}
