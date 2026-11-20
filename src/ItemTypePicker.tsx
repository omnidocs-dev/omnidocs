import {useRef, useState} from 'react';
import {
 Broadcast, Check, Circuitry, Code, Cube, Database, File, Globe,
 HardDrives, Lightning, MagnifyingGlass, Plugs, Queue, Stack, Terminal, User, Wrench, DeviceMobile,
} from '@phosphor-icons/react';
import {elementTypes, type ElementType} from '../shared/element-types';

const icons = {
 person: User, system: Stack, external: Globe, app: Cube, webapp: Globe,
 mobileapp: DeviceMobile, api: Broadcast, worker: Wrench, database: Database,
 cache: Lightning, broker: Queue, storage: File, component: Circuitry,
 controller: Terminal, service: Cube, repository: Database, adapter: Plugs,
 code: Code, deployment: HardDrives,
} satisfies Record<ElementType, typeof Cube>;

type Option = typeof elementTypes[number];

function TypeIcon({option}: {option: Option}) {
 const Icon = icons[option.id];
 return <span className="item-type-icon" data-kind={option.kind} aria-hidden="true"><Icon size={19} weight="duotone"/></span>;
}

export function ItemTypePicker({options, value, disabled, onChange}: {
 options: readonly Option[];
 value?: ElementType;
 disabled: boolean;
 onChange: (value: ElementType) => void;
}) {
 const optionList = useRef<HTMLDivElement>(null);
 const [query, setQuery] = useState('');
 const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const visible = options.filter(option => {
  const searchable = `${option.label} ${option.id} ${option.group}`.toLocaleLowerCase();
  return terms.every(term => searchable.includes(term));
 });
 const groups = [...new Set(visible.map(option => option.group))];

 function choose(option: Option) {
  if (disabled) return;
  onChange(option.id);
  setQuery('');
 }

 return <div className="item-type-field" role="group" aria-label="Item type">
  <span className="item-type-label">Item type</span>
  <div className="item-type-picker">
   <div className="item-type-search">
    <MagnifyingGlass size={17} aria-hidden="true"/>
    <input type="search" aria-label="Search item types" placeholder="Search item types…"
     value={query} disabled={disabled} onChange={event => setQuery(event.target.value)}
     onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Enter') {
       event.preventDefault();
       if (visible.length === 1) choose(visible[0]);
      }
      if (event.key === 'ArrowDown') {
       event.preventDefault();
       optionList.current?.querySelector<HTMLButtonElement>('.item-type-options button:not(:disabled)')?.focus();
      }
     }}/>
   </div>
   <div className="item-type-options" ref={optionList}>
    {visible.length === 0 && <p className="item-type-empty" role="status">No matching item types.</p>}
    {groups.map(group => <div className="item-type-group" key={group} role="group" aria-label={group}>
     <span className="item-type-group-label">{group}</span>
     <div className="item-type-grid">
     {visible.filter(option => option.group === group).map(option => (
      <button key={option.id} type="button" disabled={disabled} aria-pressed={option.id === value} onClick={() => choose(option)}>
       <TypeIcon option={option}/>
       <span>{option.label}</span>
       {option.id === value && <Check size={16} aria-hidden="true"/>}
      </button>
     ))}
     </div>
    </div>)}
   </div>
  </div>
 </div>;
}
