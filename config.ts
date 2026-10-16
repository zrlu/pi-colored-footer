import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { DEFAULT_FOOTER_ORDER, FOOTER_SLOT_KEYS } from './layout.ts';

export interface ColoredFooterConfig {
 order: string[];
}

export const COLORED_FOOTER_CONFIG_BASENAME = 'pi-colored-footer.json';
export const DEFAULT_COLORED_FOOTER_CONFIG: ColoredFooterConfig = { order: [...DEFAULT_FOOTER_ORDER] };

function isObject(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Keep only known slot keys, drop duplicates, and append any slot the order omits.
export function normalizeOrder(value: unknown, fallback: string[] = DEFAULT_FOOTER_ORDER): string[] {
 const seen = new Set<string>();
 const order: string[] = [];
 if (Array.isArray(value)) {
  for (const entry of value) {
   if (typeof entry !== 'string') continue;
   const key = entry.trim();
   if (FOOTER_SLOT_KEYS.includes(key) && !seen.has(key)) { seen.add(key); order.push(key); }
  }
 }
 for (const key of fallback) if (!seen.has(key)) { seen.add(key); order.push(key); }
 return order;
}

export function getColoredFooterConfigPath(agentDir: string = getAgentDir()): string {
 return join(agentDir, COLORED_FOOTER_CONFIG_BASENAME);
}

export function readColoredFooterConfig(configPath: string = getColoredFooterConfigPath()): ColoredFooterConfig {
 if (!existsSync(configPath)) {
  writeColoredFooterConfig(DEFAULT_COLORED_FOOTER_CONFIG, configPath);
  return { order: [...DEFAULT_FOOTER_ORDER] };
 }
 try {
  const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
  if (!isObject(parsed)) return { order: [...DEFAULT_FOOTER_ORDER] };
  return { order: normalizeOrder(parsed.order) };
 } catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[pi-colored-footer] Failed to read ${configPath}: ${message}`);
  return { order: [...DEFAULT_FOOTER_ORDER] };
 }
}

export function writeColoredFooterConfig(
 config: ColoredFooterConfig,
 configPath: string = getColoredFooterConfigPath(),
): { ok: true } | { ok: false; error: string } {
 try {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify({ order: normalizeOrder(config.order) }, null, 2)}\n`, 'utf-8');
  return { ok: true };
 } catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[pi-colored-footer] Failed to write ${configPath}: ${message}`);
  return { ok: false, error: message };
 }
}
