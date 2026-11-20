import { useEffect, useRef, useState } from 'react';
import { Plus, FolderOpen, X, ArrowRight } from '@phosphor-icons/react';
export type Space = { id: string; name: string; folder: string; default: boolean };
export function SpaceManager({ active, onOpen, onClose }: { active: string | null; onOpen: (space: Space) => Promise<void>; onClose: () => void }) {
 const ref = useRef<HTMLDialogElement>(null);
 const [spaces, setSpaces] = useState<Space[]>([]), [token, setToken] = useState(''), [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const [name, setName] = useState(''), [description, setDescription] = useState(''), [systemName, setSystemName] = useState('');
 useEffect(() => {
  ref.current?.showModal();
  void fetch('/api/spaces').then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setSpaces(result.spaces); setToken(result.editToken); }).catch(() => setError('Start the local Studio server to create and save spaces. Run npm run studio in the OmniDocs folder.'));
 }, []);
 async function open(space: Space) { setBusy(true); setError(''); try { await onOpen(space); onClose(); } catch (err) { setError(err instanceof Error ? err.message : 'Cannot open space.'); } finally { setBusy(false); } }
 async function create() {
  setBusy(true); setError('');
  try {
   const response = await fetch('/api/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-omnidocs-token': token }, body: JSON.stringify({ name, description, ...(systemName.trim() ? { systemName } : {}) }) });
   const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Cannot create space.');
   setSpaces(items => [...items, result]); setCreating(false); await onOpen(result); onClose();
  } catch (err) { setError(err instanceof Error ? err.message : 'Cannot create space.'); } finally { setBusy(false); }
 }
 return <dialog ref={ref} className="modal spaces-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><div className="modal-header"><h2>Your spaces</h2><button className="icon-button" aria-label="Close spaces" disabled={busy} onClick={onClose}><X size={19}/></button></div><div className="editor-form"><p className="muted">Each space has its own Markdown documents. Canvas changes are saved into that folder.</p>
  {error && <p className="editor-error" role="alert">{error}</p>}
  {creating ? <form className="space-create-form" onSubmit={event => { event.preventDefault(); void create(); }}><label>Space name<input required maxLength={160} dir="auto" autoFocus value={name} onChange={event => setName(event.target.value)}/></label><label>Purpose / description<textarea required maxLength={2000} rows={3} dir="auto" value={description} onChange={event => setDescription(event.target.value)}/></label><label>Primary software system<input maxLength={160} dir="auto" placeholder={name || 'Same as space name'} value={systemName} onChange={event => setSystemName(event.target.value)}/></label><p className="muted">Start with a C4 context and an empty container view. Add your own people, systems, containers, components, and connections.</p><div className="editor-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => setCreating(false)}>Back</button><button className="button primary" disabled={busy || !token}>{busy ? 'Creating…' : 'Create space'}</button></div></form> : <><div className="space-list">{spaces.map(space => <button key={space.id} disabled={busy} aria-current={active === space.id ? 'true' : undefined} onClick={() => void open(space)}><FolderOpen size={23}/><span><strong dir="auto">{space.name}</strong><small>{space.folder}</small></span>{active === space.id ? <small>Current</small> : <ArrowRight size={18}/>}</button>)}</div><button className="button primary" disabled={busy || !token} onClick={() => setCreating(true)}><Plus size={17}/>New space</button></>}
 </div></dialog>;
}
