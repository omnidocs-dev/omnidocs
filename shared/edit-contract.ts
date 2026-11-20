import { z } from 'zod';
import type { SourceFile } from './model.ts';
import {layoutSnapshotSchema,portSchema} from './layout-state.ts';
import { elementTypeIds } from './element-types.ts';
import { sha256 } from './sha256.ts';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).max(160);
const text = z.string().trim().min(1).max(4000);
export const editCommandSchema = z.discriminatedUnion('op', [
 z.object({ op: z.enum(['entity.create','entity.update']), id, viewId: id, kind: z.enum(['person','system','external','container','database','queue','component','code','deployment']), elementType: z.enum(elementTypeIds).optional(), name: text, description: text, technology: z.string().trim().max(500).default('') }).strict(),
 z.object({ op: z.enum(['relation.create','relation.update']), id, viewId: id, source: id, target: id, sourceHandle:portSchema.optional(),targetHandle:portSchema.optional(), label: text, protocol: z.string().trim().max(500).default('') }).strict(),
 z.object({ op: z.literal('view.create'), id: id.regex(/^[a-zA-Z0-9_-]+$/, 'View keys use letters, numbers, underscores, or hyphens.'), viewId: id, scope: id, name: text, description: text }).strict(),
 z.object({op:z.literal('flow.create'),id,name:text,description:text}).strict(),
 z.object({op:z.literal('view.include'),viewId:id,ids:z.array(id).min(1).max(100)}).strict(),
 z.object({op:z.literal('layout.save'),viewId:id,key:z.string().min(1).max(8000),layout:layoutSnapshotSchema}).strict(),
 z.object({ op: z.literal('workspace.organize') }).strict(),
 z.object({ op: z.literal('entity.delete'), id, viewId: id, cascade: z.boolean().default(false) }).strict(),
 z.object({ op: z.literal('relation.delete'), id, viewId: id }).strict(),
]);
export type EditCommand = z.infer<typeof editCommandSchema>;
export type FileChange = { path: string; before: string | null; after: string | null };
export function workspaceRevision(files: SourceFile[]) { return sha256(JSON.stringify([...files].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(file => [file.path, file.content]))); }
export function fileChanges(before: SourceFile[], after: SourceFile[]): FileChange[] {
 const original = new Map(before.map(file => [file.path, file.content]));
 const remaining = new Set(after.map(file => file.path));
 return [...after.filter(file => original.get(file.path) !== file.content).map(file => ({ path: file.path, before: original.get(file.path) ?? null, after: file.content })), ...before.filter(file => !remaining.has(file.path)).map(file => ({path:file.path,before:file.content,after:null}))];
}
