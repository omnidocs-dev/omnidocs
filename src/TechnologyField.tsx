import {useId, useRef, useState} from 'react';
import {Tag, X} from '@phosphor-icons/react';
import {findTechnologyLogos, technologyCatalog, TechnologyIcon, type Technology} from './technology-logos';

const splitTechnologies = (value: string) => value.split(/[,;]|\s+\/\s+/).map(item => item.trim()).filter(Boolean);

export function TechnologyField({value, required, onChange}: {
 value: string;
 required: boolean;
 onChange: (value: string) => void;
}) {
 const input = useRef<HTMLInputElement>(null);
 const options = useRef<HTMLDivElement>(null);
 const inputId = useId();
 const [open, setOpen] = useState(false);
 const [selected, setSelected] = useState(() => splitTechnologies(value));
 const [draft, setDraft] = useState('');
 const fragment = draft.trim().toLowerCase();
 const terms = fragment.split(/\s+/).filter(Boolean);
 const suggestions = technologyCatalog.flatMap(technology => {
  const names = [technology.label, technology.id, ...technology.aliases].map(name => name.toLowerCase());
  if (selected.some(item => names.includes(item.toLowerCase()))) return [];
  const searchable = [...names, ...technology.tags.map(tag => tag.toLowerCase())].join(' ');
  if (!terms.every(term => searchable.includes(term))) return [];
  const rank = names.includes(fragment) ? 0 : names.some(name => name.startsWith(fragment)) ? 1 : 2;
  return [{technology, rank}];
 }).sort((a, b) => a.rank - b.rank || a.technology.label.localeCompare(b.technology.label)).slice(0, 8);

 function update(items: string[], pending: string) {
  setSelected(items);
  setDraft(pending);
  onChange([...items, pending.trim()].filter(Boolean).join(', '));
 }

 function commit(text: string) {
  const items = [...selected];
  for (const item of splitTechnologies(text)) {
   if (!items.some(existing => existing.toLowerCase() === item.toLowerCase())) items.push(item);
  }
  update(items, '');
 }

 function choose(technology: Technology) {
  commit(technology.label);
  input.current?.focus();
  setOpen(false);
 }

 return <div className="technology-field" onBlur={event => {
  if (!event.currentTarget.contains(event.relatedTarget)) {
   if (draft.trim()) commit(draft);
   setOpen(false);
  }
 }} onKeyDown={event => {
  if (event.key === 'Escape' && open && !event.nativeEvent.isComposing) {
   event.preventDefault();
   event.stopPropagation();
   input.current?.focus();
   setOpen(false);
  }
 }}>
  <label htmlFor={inputId}>Technology</label>
  <div className="technology-selection">
   {selected.map((item, index) => {
    const logos = findTechnologyLogos(item);
    return (
     <span className="technology-chip" key={index} title={item}>
      {logos.length
       ? logos.map(logo => <TechnologyIcon key={logo.id} technology={logo}/>)
       : <Tag size={13} aria-hidden="true"/>}
      <span dir="auto">{item}</span>
      <button type="button" aria-label={`Remove ${item}`} onClick={() => {
       update(selected.filter((_, position) => position !== index), draft);
       input.current?.focus();
      }}><X size={12} aria-hidden="true"/></button>
     </span>
    );
   })}
   <input id={inputId} ref={input} dir="auto" required={required && selected.length === 0} value={draft}
    autoComplete="off" placeholder={selected.length ? 'Add technology…' : 'Search or enter technologies'}
    onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
    onChange={event => { update(selected, event.target.value); setOpen(true); }}
    onKeyDown={event => {
     if (event.nativeEvent.isComposing) return;
     if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (open) options.current?.querySelector('button')?.focus();
      else setOpen(true);
     }
     if (event.key === 'Enter' && draft.trim()) {
      event.preventDefault();
      const exact = suggestions.find(({rank}) => rank === 0);
      if (exact) choose(exact.technology);
      else {
       commit(draft);
       setOpen(false);
      }
     }
    }}/>
  </div>
  {open && <div className="technology-suggestions" ref={options} role="group" aria-label="Technology suggestions">
   {suggestions.map(({technology}) => <button type="button" key={technology.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(technology)}>
    <TechnologyIcon technology={technology}/><span>{technology.label}</span>
   </button>)}
   {!suggestions.length && <p role="status">No matching logos. You can enter a custom technology.</p>}
  </div>}
 </div>;
}
