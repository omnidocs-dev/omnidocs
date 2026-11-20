import { compileModel, type SourceFile } from './model.ts';

/** Compatibility with the Studio's supported adapters, not official Structurizr certification. */
export function inspectWorkspace(files: SourceFile[]) {
 const model = compileModel(files);
 const errors = [...model.errors];
 if (!files.length) errors.unshift('No Markdown documents were found.');
 const compatible = errors.length === 0;
 const editable = compatible && (!model.importInfo || !!model.importInfo.authoritativeSource && model.importInfo.integrity === 'verified');
 return { compatible, editable, projectName:model.project.name, projectDescription:model.project.description,
  format: model.importInfo ? 'Structurizr JSON + Markdown' : 'OmniDocs Markdown', documents: files.length, elements: model.entities.length, views: model.views.length, errors, notes: [...(model.importInfo?.notes ?? []), ...(compatible && !editable ? ['The diagrams can be loaded, but visual editing requires a verified canonical DSL source and synchronized snapshot.'] : [])] };
}
export type WorkspaceInspection = ReturnType<typeof inspectWorkspace>;
