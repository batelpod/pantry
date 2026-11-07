// Shared item rules and formatting, used by the pantry and shopping screens.

export const SOON_DAYS = 7; // "expiring soon" = within this many days

// 2 → "2", 1.5 → "1.5"
export const num = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1));

// Low = at or below the "buy more" level. Out = nothing left.
export const isLowQty = (qty, min) => Number(qty) <= Number(min);

// Days until expiry (negative = already expired), or null if no date.
export function daysLeft(item) {
  if (!item.expires_on) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(item.expires_on + "T00:00:00") - today) / 86400000);
}
export const expiresSoon = (item) => { const d = daysLeft(item); return d !== null && d <= SOON_DAYS; };

// "just now", "5 minutes ago", "yesterday", "last week"…
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(iso) {
  const secs = (new Date(iso) - Date.now()) / 1000;
  const steps = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of steps) if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  return "just now";
}

// Is this item on the shopping list? Low items are on it automatically.
export const onShoppingList = (item) => item.on_list || item.in_cart || isLowQty(item.qty, item.min_qty);

// How many to buy if nobody set it: enough to get back above the "buy more" level.
export const suggestedBuy = (item) =>
  item.buy_qty ? Number(item.buy_qty) : Math.max(1, Math.ceil(Number(item.min_qty) - Number(item.qty) + 1));
