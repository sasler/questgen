export const GUEST_ID_STORAGE_KEY = "questgen-guest-id";
export const GUEST_ID_HEADER = "x-questgen-guest-id";

function createGuestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = char === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

export function getGuestId(): string | null {
  if (typeof window === "undefined") return null;

  const existing = localStorage.getItem(GUEST_ID_STORAGE_KEY);
  if (existing) return existing;

  const created = createGuestId();
  localStorage.setItem(GUEST_ID_STORAGE_KEY, created);
  return created;
}

export function getGuestRequestHeaders(): Record<string, string> {
  const guestId = getGuestId();
  return guestId ? { [GUEST_ID_HEADER]: guestId } : {};
}
