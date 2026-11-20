import {z} from 'zod';
import {parse,stringify} from 'yaml';
import type {SourceFile} from './model.ts';
export const arrangementSchema=z.object({mode:z.enum(['auto','horizontal','vertical','row','column','grid']),spacing:z.enum(['compact','comfortable','wide'])}).strict();
export type Arrangement=z.infer<typeof arrangementSchema>;
export const defaultArrangement:Arrangement={mode:'auto',spacing:'comfortable'};
const coordinate=z.number().finite().min(-1e7).max(1e7),positive=z.number().finite().positive().max(1e7);
export const layoutSnapshotSchema=z.object({viewport:z.object({x:coordinate,y:coordinate,zoom:z.number().min(0.01).max(10)}),positions:z.record(z.string(),z.object({x:coordinate,y:coordinate})),parents:z.record(z.string(),z.string().optional()).optional().transform(value=>value?Object.fromEntries(Object.entries(value).filter(([,parent])=>parent!==undefined)):undefined),dimensions:z.record(z.string(),z.object({width:positive,height:positive})).optional(),size:z.object({width:positive,height:positive}),arrangement:arrangementSchema.optional(),routing:z.literal('automatic').optional()}).strict();
export type LayoutSnapshot=z.infer<typeof layoutSnapshotSchema>;
export const portSchema=z.string().regex(/^port-(left|right|top|bottom)-[0-2]$/);
export const layoutDocumentSchema=z.object({kind:z.literal('studio-layout'),version:z.literal(1),layouts:z.record(z.string(),layoutSnapshotSchema).default({}),connections:z.record(z.string(),z.object({sourceHandle:portSchema,targetHandle:portSchema})).default({})}).strict();
export const layoutPath='studio/layout.md';
export function readLayoutState(files:SourceFile[]){
 const file=files.find(file=>file.path===layoutPath);if(!file)return layoutDocumentSchema.parse({kind:'studio-layout',version:1});
 const match=file.content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);if(!match)throw new Error(`${layoutPath}: Expected Studio layout metadata.`);
 return layoutDocumentSchema.parse(parse(match[1]));
}
export function writeLayoutState(files:SourceFile[],data:z.infer<typeof layoutDocumentSchema>){
 const valid=layoutDocumentSchema.parse(data),next={path:layoutPath,content:`---\n${stringify(valid)}---\n# Studio presentation settings\n\nSaved arrangement, node positions, frame sizes and connection points. This is OmniDocs presentation metadata, separate from the canonical C4 model.\n`};
 return [...files.filter(file=>file.path!==layoutPath),next];
}
