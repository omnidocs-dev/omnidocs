import type {View} from '../shared/model';

const levels = [
 {type: 'context', code: 'C1', label: 'Context'},
 {type: 'container', code: 'C2', label: 'Containers'},
 {type: 'component', code: 'C3', label: 'Components'},
 {type: 'code', code: 'C4', label: 'Code'},
 {type: 'deployment', code: undefined, label: 'Deployment'},
 {type: 'dataflow', code: undefined, label: 'Data flow'},
] as const;

export function ViewLevelPicker({views, value, disabled, onChange}: {
 views: readonly View[];
 value: string;
 disabled: boolean;
 onChange: (view: View) => void;
}) {
 const selected = views.find(view => view.id === value);
 const sameLevel = views.filter(view => view.type === selected?.type);
 return <div className="editor-view-picker" role="group" aria-label="Destination view">
  <span className="item-type-label">Destination view</span>
  <div className="editor-level-options" role="group" aria-label="Diagram level">
   {levels.map(level => {
    const destination = views.find(view => view.type === level.type);
    if (!level.code && !destination) return null;
    return <button key={level.type} type="button" disabled={disabled || !destination}
     aria-pressed={selected?.type === level.type}
     title={destination ? undefined : 'No available view at this level'}
     onClick={() => { if (destination && selected?.type !== level.type) onChange(destination); }}>
     {level.code && <strong>{level.code}</strong>}<span>{level.label}</span>
    </button>;
   })}
  </div>
  {sameLevel.length === 1 && <p className="editor-selected-view" dir="auto">{selected?.name}</p>}
  {sameLevel.length > 1 && <div className="editor-view-options" role="group" aria-label="Views at this level">
   {sameLevel.map(view => <button type="button" key={view.id} disabled={disabled}
    aria-pressed={view.id === value} dir="auto" onClick={() => onChange(view)}>{view.name}</button>)}
  </div>}
 </div>;
}
