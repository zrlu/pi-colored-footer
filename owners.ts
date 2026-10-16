import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'test', 'tests']);
// setStatus("key", ...) or setStatus(KEY_CONST, ...).
const STATUS_CALL = /\.setStatus\s*\(\s*(?:['"`]([^'"`]+)['"`]|([A-Za-z_$][\w$]*))/g;
// const KEY_CONST = "key";
const CONST_DEF = /(?:^|\s)const\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]([^'"`]+)['"`]/g;

function listDirs(root: string): string[] {
 if (!existsSync(root)) return [];
 try {
  return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
 } catch { return []; }
}

function collectSources(dir: string, out: string[], depth: number): void {
 if (depth > 6 || !existsSync(dir)) return;
 let entries;
 try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
 for (const entry of entries) {
  if (entry.name.startsWith('.')) continue;
  const full = join(dir, entry.name);
  if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) collectSources(full, out, depth + 1); continue; }
  const dot = entry.name.lastIndexOf('.');
  if (dot >= 0 && SOURCE_EXTENSIONS.has(entry.name.slice(dot))) out.push(full);
 }
}

function readSource(file: string): string | undefined {
 try { return readFileSync(file, 'utf-8'); } catch { return undefined; }
}

function statusKeysInText(text: string, constants: Map<string, string>): string[] {
 const keys: string[] = [];
 STATUS_CALL.lastIndex = 0;
 let match: RegExpExecArray | null;
 while ((match = STATUS_CALL.exec(text))) {
  const literal = match[1];
  if (literal) { keys.push(literal); continue; }
  const resolved = constants.get(match[2]);
  if (resolved) keys.push(resolved);
 }
 return keys;
}

function collectConstants(text: string, constants: Map<string, string>): void {
 CONST_DEF.lastIndex = 0;
 let match: RegExpExecArray | null;
 while ((match = CONST_DEF.exec(text))) {
  if (!constants.has(match[1])) constants.set(match[1], match[2]);
 }
}

function packageLabel(dir: string, fallback: string): string {
 try {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { name?: unknown };
  if (typeof manifest.name === 'string' && manifest.name.trim()) return manifest.name.trim();
 } catch { /* fall through */ }
 return fallback;
}

function activeNpmPackages(agentDir: string): string[] | null {
 try {
  const settings = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf-8')) as { packages?: unknown };
  if (!Array.isArray(settings.packages)) return null;
  return settings.packages
   .filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('npm:'))
   .map(entry => {
    const spec = entry.slice(4).trim();
    const at = spec.lastIndexOf('@');
    return at > 0 ? spec.slice(0, at) : spec;
   })
   .filter(Boolean);
 } catch { return null; }
}

function scanOwner(dir: string, label: string, wanted: Set<string>, owners: Map<string, string>): void {
 const sources: string[] = [];
 collectSources(dir, sources, 0);
 const constants = new Map<string, string>();
 const texts: string[] = [];
 for (const file of sources) {
  const text = readSource(file);
  if (text === undefined) continue;
  texts.push(text);
  collectConstants(text, constants);
 }
 for (const text of texts) {
  for (const key of statusKeysInText(text, constants)) {
   if (wanted.has(key) && !owners.has(key)) owners.set(key, label);
  }
 }
}

// Pi exposes only slot key -> text, so infer the owning extension by scanning
// extension sources for the setStatus("<key>") call.
export function detectSlotOwners(keys: readonly string[]): Map<string, string> {
 const owners = new Map<string, string>();
 const wanted = new Set(keys);
 if (!wanted.size) return owners;
 const agentDir = getAgentDir();
 const candidates = new Map<string, string>();

 const localRoot = join(agentDir, 'extensions');
 for (const name of listDirs(localRoot)) candidates.set(name, join(localRoot, name));

 const projectRoot = join(process.cwd(), '.pi', 'extensions');
 for (const name of listDirs(projectRoot)) candidates.set(name, join(projectRoot, name));

 const npmRoot = join(agentDir, 'npm', 'node_modules');
 const active = activeNpmPackages(agentDir);
 for (const name of active ?? listDirs(npmRoot)) {
  const dir = join(npmRoot, name);
  if (existsSync(join(dir, 'package.json'))) candidates.set(packageLabel(dir, name), dir);
 }

 for (const [label, dir] of candidates) scanOwner(dir, label, wanted, owners);
 return owners;
}
