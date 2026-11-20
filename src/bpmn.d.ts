declare module 'bpmn-js/lib/NavigatedViewer' {
 export default class NavigatedViewer {
  constructor(options: { container: HTMLElement });
  importXML(xml: string): Promise<{ warnings: unknown[] }>;
  get<T = any>(name: string): T;
  on(event: string, callback: (event: any) => void): void;
  destroy(): void;
 }
}
