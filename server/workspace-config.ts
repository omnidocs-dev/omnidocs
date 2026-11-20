import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Workspace selection is configuration, not project-specific renderer behavior. */
export async function workspaceConfiguration(root: string) {
 let config: { documentRoot?: string; portableOutput?: string; spacesRoot?: string } = {};
 try { config = JSON.parse(await readFile(path.join(root, 'omnidocs.config.json'), 'utf8')); }
 catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Cannot read omnidocs.config.json: ${error instanceof Error ? error.message : error}`); }
 for (const key of ['documentRoot', 'portableOutput', 'spacesRoot'] as const) if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key]!.trim())) throw new Error(`omnidocs.config.json: ${key} must be a non-empty path.`);
 const documents = path.resolve(root, process.env.OMNIDOCS_DIR || config.documentRoot || 'docs/demo');
 const output = path.resolve(root, process.env.OMNIDOCS_OUTPUT || config.portableOutput || 'output/OmniDocs-Studio.html');
 return { documents, output, spaces: path.resolve(root, process.env.OMNIDOCS_SPACES_DIR || config.spacesRoot || 'projects'), demo: documents === path.join(root, 'docs/demo') };
}
