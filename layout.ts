import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
export const FOOTER_SLOT_COLORS = {
 stats: '44;52;58',
 backend: '38;58;76',
 'dsh-minimal': '55;43;73',
 tokenSpeed: '30;65;59',
 model: '58;46;62',
};
// Slots whose text the extension computes itself rather than receiving as a plugin status.
export const BUILTIN_SLOT_KEYS = ['stats', 'model'];
export const FOOTER_SLOT_KEYS = Object.keys(FOOTER_SLOT_COLORS);
export const DEFAULT_FOOTER_ORDER = [...FOOTER_SLOT_KEYS];
export function renderPluginStatuses(statuses, width, order = DEFAULT_FOOTER_ORDER, reportSlot) {
 width = Math.max(0, Math.floor(width));
 if (!width) return [];
 const slots = order.map(key => [key, FOOTER_SLOT_COLORS[key] ?? '48;48;48']);
 const clean = text => String(text).replace(/[\r\n\t]/g, ' ').replace(/ +/g, ' ').trim();
 const maximums = renderPluginStatuses.maxWidths ??= new Map();
 const texts = slots.map(([key]) => clean(statuses.get(key) ?? '—'));
 const wanted = slots.map(([key], index) => {
  const longest = Math.max(maximums.get(key) ?? 0, visibleWidth(texts[index]));
  maximums.set(key, longest);
  return longest + 2;
 });
 const total = wanted.reduce((sum, size) => sum + size, 0);
 const minimum = width >= slots.length ? 1 : 0;
 const available = width - slots.length * minimum;
 const shares = wanted.map(size => available * size / total);
 const sizes = shares.map(size => minimum + Math.floor(size));
 const ranked = slots.map((_slot, index) => index).sort((a, b) => (shares[b] % 1) - (shares[a] % 1) || a - b);
 const remainder = width - sizes.reduce((sum, size) => sum + size, 0);
 for (let i = 0; i < remainder; i++) sizes[ranked[i]]++;
 const line = slots.map(([key, color], index) => {
  const size = sizes[index];
  const inset = size >= 4 ? 1 : 0;
  // Publish the room left for the slot's text, so owners can trim their status to fit.
  if (reportSlot) reportSlot(key, Math.max(0, size - 2 * inset));
  if (!size) return '';
  const clipped = truncateToWidth(texts[index], size - 2 * inset, '…');
  const background = `\x1b[48;2;${color}m`;
  // Restore the cell background after plugin resets without changing foreground colors.
  const colored = clipped.replace(/\x1b\[[0-9;:]*m/g, sequence => sequence + background);
  const padded = ' '.repeat(inset) + colored + ' '.repeat(Math.max(0, size - inset - visibleWidth(clipped)));
  return `\x1b[0m${background}${padded}\x1b[0m`;
 }).join('');
 return [line];
}
