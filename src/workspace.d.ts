import type { SourceFile } from '../shared/model';
declare global {
 interface Window { __OMNIDOCS_SNAPSHOT__?: { name: string; files: SourceFile[]; demo?: boolean }; }
}
