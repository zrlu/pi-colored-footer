import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { DEFAULT_FOOTER_ORDER, FOOTER_SLOT_KEYS } from './layout.ts';

export interface ColoredFooterConfig {
 order: string[];
 multiline: boolean;
}

export const COLORED_FOOTER_CONFIG_BASENAME = 'pi-colored-footer.json';
export const DEFAULT_COLORED_FOOTER_CONFIG: ColoredFooterConfig = { order: [...DEFAULT_FOOTER_ORDER], multiline: false };

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

// Coerce an arbitrary parsed value into a well-formed config.
export function normalizeConfig(value: unknown): ColoredFooterConfig {
 const record = isObject(value) ? value : {};
 return { order: normalizeOrder(record.order), multiline: record.multiline === true };
}

export function getColoredFooterConfigPath(agentDir: string = getAgentDir()): string {
 return join(agentDir, COLORED_FOOTER_CONFIG_BASENAME);
}

export function readColoredFooterConfig(configPath: string = getColoredFooterConfigPath()): ColoredFooterConfig {
 if (!existsSync(configPath)) {
  writeColoredFooterConfig(DEFAULT_COLORED_FOOTER_CONFIG, configPath);
  return { ...DEFAULT_COLORED_FOOTER_CONFIG, order: [...DEFAULT_FOOTER_ORDER] };
 }
 try {
  const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
  return normalizeConfig(parsed);
 } catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[pi-colored-footer] Failed to read ${configPath}: ${message}`);
  return { ...DEFAULT_COLORED_FOOTER_CONFIG, order: [...DEFAULT_FOOTER_ORDER] };
 }
}

export function writeColoredFooterConfig(
 config: ColoredFooterConfig,
 configPath: string = getColoredFooterConfigPath(),
): { ok: true } | { ok: false; error: string } {
 try {
  mkdirSync(dirname(configPath), { recursive: true });
  const normalized = normalizeConfig(config);
  writeFileSync(configPath, `${JSON.stringify({ order: normalized.order, multiline: normalized.multiline }, null, 2)}\n`, 'utf-8');
  return { ok: true };
 } catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[pi-colored-footer] Failed to write ${configPath}: ${message}`);
  return { ok: false, error: message };
 }
}
