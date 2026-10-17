import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import { homedir } from 'node:os';
import { relative, isAbsolute, sep } from 'node:path';
import { renderPluginStatuses, renderPluginStatusesMultiline, DEFAULT_FOOTER_ORDER, FOOTER_SLOT_KEYS } from './layout.ts';
import { readColoredFooterConfig, writeColoredFooterConfig, normalizeOrder } from './config.ts';
import { openFooterReorder } from './reorder.ts';
import { detectSlotOwners } from './owners.ts';

const fmt = (n: number) => n < 1000 ? `${n}` : n < 10000 ? `${(n / 1000).toFixed(1)}k` : n < 1e6 ? `${Math.round(n / 1000)}k` : `${(n / 1e6).toFixed(1)}M`;

export default function coloredFooter(pi: ExtensionAPI) {
 let current: ExtensionContext;
 const initialConfig = readColoredFooterConfig();
 let order = initialConfig.order;
 let multiline = initialConfig.multiline;
 let requestRender: (() => void) | undefined;
 let latestBlocks: ReadonlyMap<string, string> = new Map();
 const lastSlotWidth = new Map<string, number>();
 // Owners (e.g. pi-backend-start) subscribe to trim their status to the room they get.
 const reportSlot = (key: string, width: number) => {
  if (lastSlotWidth.get(key) === width) return;
  lastSlotWidth.set(key, width);
  pi.events.emit('pi.footer.slotWidth', { key, width });
 };
 const install = (_event: unknown, ctx: ExtensionContext) => {
  current = ctx;
  if (!ctx.hasUI || (ctx.mode && ctx.mode !== 'tui')) return;
  ctx.ui.setFooter((tui, theme, data) => {
   requestRender = () => tui.requestRender();
   const unsubscribe = data.onBranchChange(() => tui.requestRender());
   let statsKey = '';
   let totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
   let hitRate: number | undefined;
   return {
    dispose: unsubscribe,
    invalidate() { statsKey = ''; },
    render(width: number) {
     if (width <= 0) return [];
     const ctx = current;
     const manager = ctx.sessionManager;
     const entries = manager.getEntries();
     const key = `${manager.getSessionId()}:${manager.getLeafId()}:${entries.length}`;
     if (key !== statsKey) {
      totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      hitRate = undefined;
      for (const entry of entries) {
       const message = entry.type === 'message' ? entry.message : undefined;
       const usage = message && (message.role === 'assistant' || message.role === 'toolResult')
        ? message.usage : 'usage' in entry ? entry.usage : undefined;
       if (!usage) continue;
       for (const field of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) totals[field] += usage[field] ?? 0;
       totals.cost += usage.cost?.total ?? 0;
       if (message?.role === 'assistant') {
        const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
        hitRate = prompt > 0 ? usage.cacheRead / prompt * 100 : undefined;
       }
      }
      statsKey = key;
     }
     let cwd = manager.getCwd();
     const rel = relative(homedir(), cwd);
     if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) cwd = rel ? `~${sep}${rel}` : '~';
     const branch = data.getGitBranch();
     const name = manager.getSessionName();
     const pathLine = `${cwd}${branch ? ` (${branch})` : ''}${name ? ` • ${name}` : ''}`;
     const parts: string[] = [];
     for (const [field, label] of [['input', '↑'], ['output', '↓'], ['cacheRead', 'R'], ['cacheWrite', 'W']] as const) {
      if (totals[field]) parts.push(`${label}${fmt(totals[field])}`);
     }
     if ((totals.cacheRead || totals.cacheWrite) && hitRate !== undefined) parts.push(`CH${hitRate.toFixed(1)}%`);
     if (totals.cost) parts.push(`$${totals.cost.toFixed(3)}`);
      const usage = ctx.getContextUsage();
      const percent = usage?.percent;
      const context = `${percent == null ? '?' : percent.toFixed(1) + '%'}/${fmt(usage?.contextWindow ?? ctx.model?.contextWindow ?? 0)}`;
      const contextText = percent != null && percent > 70 ? theme.fg(percent > 90 ? 'error' : 'warning', context) : context;
      const model = ctx.model;
      const thinking = model?.reasoning ? ` • ${ctx.thinkingLevel ?? pi.getThinkingLevel()}` : '';
      const provider = data.getAvailableProviderCount() > 1 && model ? `(${model.provider}) ` : '';
      const modelText = `${provider}${model?.id ?? 'no-model'}${thinking}`;
      const statuses = data.getExtensionStatuses();
      const blocks = new Map(statuses);
      blocks.set('stats', [...parts, contextText].join(' '));
      blocks.set('model', modelText);
      latestBlocks = blocks;
      const extra = [...statuses].filter(([key]) => !FOOTER_SLOT_KEYS.includes(key)).map(([, text]) => text.replace(/[\r\n\t]/g, ' '));
      return [
       truncateToWidth(theme.fg('dim', pathLine), width, '…'),
        ...(multiline
         ? renderPluginStatusesMultiline(blocks, width, order, reportSlot)
         : renderPluginStatuses(blocks, width, order, reportSlot)),
       ...(extra.length ? [truncateToWidth(extra.join('  '), width, '…')] : []),
      ];
     },
   };
  });
 };
 pi.on('session_start', install);
 for (const event of ['model_select', 'turn_end', 'agent_end'] as const) {
  pi.on(event, (_event, ctx) => { current = ctx; });
 }
 pi.registerCommand('footer', {
  description: 'Reorder the colored footer blocks (opens an interactive screen); args: order <key...> | up <key> | down <key> | multiline [on|off] | reset',
  getArgumentCompletions: prefix => {
   const head = prefix.trim().toLowerCase();
   return ['order', 'up', 'down', 'reset', 'multiline', ...FOOTER_SLOT_KEYS]
    .filter(value => value.startsWith(head))
    .map(value => ({ label: value, value }));
  },
  handler: async (args, ctx) => {
   const tell = (message, kind = 'info') => ctx.hasUI ? ctx.ui.notify(message, kind) : console.log(message);
   const summary = () => `Footer blocks: ${order.join(' → ')}${multiline ? ' (multiline)' : ''}`;
   const save = (nextOrder: string[], nextMultiline: boolean = multiline) => {
    const result = writeColoredFooterConfig({ order: nextOrder, multiline: nextMultiline });
    if (!result.ok) { tell(`Failed to save footer settings: ${result.error}`, 'error'); return; }
    order = normalizeOrder(nextOrder, order);
    multiline = nextMultiline;
    requestRender?.();
    tell(summary());
   };
   const parts = args.trim().split(/\s+/).filter(Boolean);
   const action = (parts[0] ?? '').toLowerCase();
   if (!action) {
    if (ctx.mode === 'tui' && ctx.hasUI) {
     const original = [...order];
     const originalMultiline = multiline;
      const owners = detectSlotOwners(order);
      const result = await openFooterReorder(ctx, { order, multiline, statuses: latestBlocks, owners }, next => { order = next.order; multiline = next.multiline; requestRender?.(); });
     if (result) { save(result.order, result.multiline); } else { order = original; multiline = originalMultiline; requestRender?.(); }
     return;
    }
    tell(summary());
    return;
   }
   if (action === 'reset') { save([...DEFAULT_FOOTER_ORDER], false); return; }
   if (action === 'multiline') {
    const arg = (parts[1] ?? '').toLowerCase();
    if (arg === 'on' || arg === 'true' || arg === 'yes') { save(order, true); return; }
    if (arg === 'off' || arg === 'false' || arg === 'no') { save(order, false); return; }
    if (!arg) { save(order, !multiline); return; }
    tell('Usage: /footer multiline [on|off]', 'warning');
    return;
   }
   if (action === 'order') {
    const requested = parts.slice(1);
    if (!requested.length) { tell('Usage: /footer order <key...>', 'warning'); return; }
    save(normalizeOrder(requested, order));
    return;
   }
   if (action === 'up' || action === 'down') {
    const key = parts[1];
    const index = order.indexOf(key);
    if (index < 0) { tell(`Unknown block "${key ?? ''}". Keys: ${FOOTER_SLOT_KEYS.join(', ')}`, 'warning'); return; }
    const target = action === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) { tell(`"${key}" is already ${action === 'up' ? 'first' : 'last'}`); return; }
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
    return;
   }
   tell('Usage: /footer [order <key...>|up <key>|down <key>|multiline [on|off]|reset]', 'warning');
  },
 });
}
