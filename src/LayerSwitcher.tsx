import { useEffect, useId, useRef, useState } from 'react';
import { CaretDown, CaretRight, Check } from '@phosphor-icons/react';
import { architectureLayers, c4Layers } from '../shared/navigation';
import type { Model, View } from '../shared/model';

function FourLayerIcon({ activeLevel }: { activeLevel?: number }) {
 return <svg className="c4-layer-icon" width="34" height="38" viewBox="0 0 36 40" aria-hidden="true" focusable="false" data-active-level={activeLevel && activeLevel <= 4 ? activeLevel : undefined}>
  {[4, 3, 2, 1].map(level => {
   const top = 3 + (level - 1) * 7;
   return <polygon key={level} data-layer={level} className={`c4-layer-plane ${level === activeLevel ? 'is-current' : ''}`} points={`18,${top} 33,${top + 6} 18,${top + 12} 3,${top + 6}`}/>;
  })}
 </svg>;
}

export function LayerSwitcher({ model, view, selection, onNavigate }: {
 model: Model; view: View; selection: string | null; onNavigate: (viewId: string) => void;
}) {
 const [open, setOpen] = useState(false), [expanded, setExpanded] = useState<number | null>(null);
 const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panelId = useId();
 const layers = architectureLayers(model, view, selection);
 const currentLevel = view.navigationLevel ?? c4Layers.find(layer => layer.type === view.type)?.level;
 useEffect(() => { setOpen(false); setExpanded(null); }, [view.id]);
 useEffect(() => {
  if (!open) return;
  function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
  function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); } }
  window.document.addEventListener('pointerdown', outside);
  window.document.addEventListener('keydown', escape);
  const frame = requestAnimationFrame(() => {
   const target = root.current?.querySelector<HTMLButtonElement>('.layer-option[aria-current="page"]') ?? root.current?.querySelector<HTMLButtonElement>('.layer-option:not(:disabled)');
   target?.focus();
  });
  return () => { cancelAnimationFrame(frame); window.document.removeEventListener('pointerdown', outside); window.document.removeEventListener('keydown', escape); };
 }, [open]);
 function choose(target: View) { setOpen(false); setExpanded(null); onNavigate(target.id); trigger.current?.focus(); }
 return <div className="canvas-layers" ref={root}>
  <button ref={trigger} type="button" className={`layer-trigger ${open ? 'active' : ''}`} aria-label="Diagram layers" aria-description={currentLevel ? `Current level ${currentLevel}` : 'Choose an architecture level'} title="Change architecture level" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
   <FourLayerIcon activeLevel={currentLevel}/><span>{currentLevel ? `L${currentLevel}` : 'C4'}</span><CaretDown size={12}/>
  </button>
  {open && <div id={panelId} className="layer-panel" role="dialog" aria-label="Architecture layers">
   <div className="layer-panel-heading"><strong>Architecture layers</strong><span>Choose your level of detail</span></div>
   <div className="layer-options">{layers.map(layer => {
    const available = layer.views.length > 0, multiple = layer.views.length > 1;
    const active = currentLevel === layer.level;
    const scope = model.entities.find(entity => entity.id === layer.preferred?.scope);
    return <div className={`layer-group ${layer.level === 5 ? 'custom-layer' : ''}`} key={layer.level}>
     <button className={`layer-option ${active ? 'active' : ''}`} type="button" aria-label={layer.level === 5 ? 'Custom level 5' : `Level ${layer.level}: ${layer.label}`} aria-current={active ? 'page' : undefined} aria-expanded={multiple ? expanded === layer.level : undefined} disabled={!available} onClick={() => { if (multiple) setExpanded(expanded === layer.level ? null : layer.level); else if (layer.preferred) choose(layer.preferred); }}>
      <span className="layer-number">{layer.level}</span><span className="layer-copy"><strong>{layer.label}</strong><small>{available ? multiple ? `${layer.views.length} diagrams available` : scope?.name ?? layer.description : 'No diagram defined'}</small></span>{multiple ? <CaretRight size={14} style={{ transform: expanded === layer.level ? 'rotate(90deg)' : undefined }}/> : active ? <Check size={16} weight="bold"/> : null}
     </button>
     {multiple && expanded === layer.level && <div className="layer-view-list">{[layer.preferred!, ...layer.views.filter(target => target.id !== layer.preferred?.id)].map(target => <button type="button" key={target.id} onClick={() => choose(target)} aria-current={view.id === target.id ? 'page' : undefined}><span><strong>{target.name}</strong><small>{model.entities.find(entity => entity.id === target.scope)?.name}</small></span>{view.id === target.id ? <Check size={14}/> : <CaretRight size={12}/>}</button>)}</div>}
    </div>;
   })}
   </div><p className="layer-panel-note">Only documented views are available. C4 has levels 1–4; level 5 is a custom perspective.</p>
  </div>}
 </div>;
}
