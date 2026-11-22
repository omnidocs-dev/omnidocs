declare module 'bpmn-js/lib/NavigatedViewer' {
 export default class NavigatedViewer {
  constructor(options: { container: HTMLElement });
  importXML(xml: string): Promise<{ warnings: unknown[] }>;
  get<T = any>(name: string): T;
  on(event: string, callback: (event: any) => void): void;
  destroy(): void;
 }
}

declare module 'saxen' {
 export class Parser {
  ns(namespaces:Record<string,string>):void;
  on(event:'error'|'warn'|'attention'|'closeTag',callback:()=>void):void;
  on(event:'openTag',callback:(type:string,attributes:()=>Record<string,string>,decode:(value:string)=>string)=>void):void;
  parse(xml:string):void;
 }
}
