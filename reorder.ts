import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { DynamicBorder } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import { Key, matchesKey, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { BUILTIN_SLOT_KEYS, DEFAULT_FOOTER_ORDER, FOOTER_SLOT_COLORS } from './layout.ts';

export interface FooterReorderInput {
 order: string[];
 statuses: ReadonlyMap<string, string>;
 owners?: ReadonlyMap<string, string>;
}

// Interactive block reorder screen. Resolves to the new order, or null when cancelled.
export async function openFooterReorder(
 ctx: ExtensionContext,
 input: FooterReorderInput,
 onPreview: (order: string[]) => void,
): Promise<string[] | null> {
 const clean = (text: string) => String(text).replace(/\x1b\[[0-9;:]*m/g, '').replace(/[\r\n\t]/g, ' ').replace(/ +/g, ' ').trim();
 return ctx.ui.custom<string[] | null>((tui, theme, _kb, done) => {
  let items = [...input.order];
  let cursor = 0;
  let grabbed = false;
  let inputWidth = 40;
  const line = (text: string) => truncateToWidth(text, inputWidth, '…');
  const border = () => new DynamicBorder(str => theme.fg('accent', str)).render(inputWidth);
  const component: Component = {
   invalidate() {},
   render(width: number) {
    inputWidth = width;
    const lines = [...border()];
    lines.push(theme.fg('accent', theme.bold('Reorder footer blocks')));
    lines.push(theme.fg('dim', 'Left to right = top to bottom.'));
    lines.push('');
    items.forEach((key, index) => {
     const selected = index === cursor;
     const held = selected && grabbed;
     const pointer = selected ? (held ? '◆' : '❯') : ' ';
     const pointerStyled = theme.fg(selected ? 'accent' : 'dim', pointer);
     const color = FOOTER_SLOT_COLORS[key] ?? '48;48;48';
     const swatch = `\x1b[48;2;${color}m  \x1b[0m`;
     const name = held ? theme.bold(theme.fg('accent', key)) : selected ? theme.fg('accent', key) : key;
     const owner = BUILTIN_SLOT_KEYS.includes(key) ? undefined : input.owners?.get(key);
     const tag = owner ? ` ${theme.fg('dim', `(${owner})`)}` : '';
     const head = `${pointerStyled} ${swatch} ${name}${tag}`;
     const sample = clean(input.statuses.get(key) ?? '—');
     const room = Math.max(0, width - visibleWidth(head) - 2);
     const tail = room > 1 ? `  ${theme.fg('dim', truncateToWidth(sample, room, '…'))}` : '';
     lines.push(line(`${head}${tail}`));
    });
    lines.push('');
    const hint = grabbed
     ? '↑↓ move • space drop • enter save • r reset • esc cancel'
     : '↑↓ select • space grab • enter save • r reset • esc cancel';
    lines.push(theme.fg('dim', hint));
    lines.push(...border());
    return lines;
   },
   handleInput(data: string) {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c')) || data === 'q') { done(null); return; }
    if (matchesKey(data, Key.enter)) { done([...items]); return; }
    if (matchesKey(data, Key.up) || data === 'k') { move(-1); return; }
    if (matchesKey(data, Key.down) || data === 'j') { move(1); return; }
    if (data === ' ') { grabbed = !grabbed; tui.requestRender(); return; }
    if (data === 'r') { items = [...DEFAULT_FOOTER_ORDER]; cursor = 0; grabbed = false; onPreview([...items]); tui.requestRender(); return; }
   },
  };
  const move = (delta: number) => {
   const target = cursor + delta;
   if (target < 0 || target >= items.length) return;
   if (grabbed) [items[cursor], items[target]] = [items[target], items[cursor]];
   cursor = target;
   onPreview([...items]);
   tui.requestRender();
  };
  return component;
 });
}
