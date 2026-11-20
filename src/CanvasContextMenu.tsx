import { useEffect, useRef } from 'react';
export type ContextAction = {label:string; run:()=>void; disabled?:boolean; title?:string; danger?:boolean};
export function CanvasContextMenu({x,y,title,actions,onClose}:{x:number;y:number;title:string;actions:ContextAction[];onClose:()=>void}) {
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const menu=ref.current;if(!menu)return;
  const box=menu.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(x,innerWidth-box.width-8))}px`;menu.style.top=`${Math.max(8,Math.min(y,innerHeight-box.height-8))}px`;
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  const close=(event:PointerEvent)=>{if(!menu.contains(event.target as Node))onClose();};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose();}};
  document.addEventListener('pointerdown',close,true);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',close,true);document.removeEventListener('keydown',escape,true);};
 },[x,y,onClose]);
 return <div ref={ref} className="canvas-context-menu" role="menu" aria-label={title} style={{left:x,top:y}} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();
  const buttons=[...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
 }}><strong dir="auto">{title}</strong>{actions.map(action=><button key={action.label} role="menuitem" className={action.danger?'danger':''} disabled={action.disabled} title={action.title} onClick={()=>{onClose();action.run();}}>{action.label}</button>)}</div>;
}
