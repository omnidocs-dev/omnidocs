import {useEffect, useRef} from 'react';
import {CaretRight, FolderSimple, GitBranch, HardDrives, Path, Stack} from '@phosphor-icons/react';
import type {View} from '../shared/model';

const levels = [
 {type:'context', code:'L1', title:'Context'},
 {type:'container', code:'L2', title:'Containers'},
 {type:'component', code:'L3', title:'Components'},
 {type:'code', code:'L4', title:'Code'},
] as const;
const categories = [
 {type:'dataflow', title:'Data flows', icon:GitBranch},
 {type:'deployment', title:'Deployment', icon:HardDrives},
 {type:'bpmn', title:'Processes', icon:Path},
] as const;

type Navigation = {activeId?: string; navigate: (id: string) => void};

function ViewLink({view, level, activeId, navigate}: Navigation & {view: View; level?: string}) {
 const active = view.id === activeId;
 return <button type="button" className={`view-link ${active ? 'active' : ''}`}
  aria-current={active ? 'page' : undefined} onClick={() => navigate(view.id)}>
  <span className={`view-dot ${view.type}`}/><span dir="auto">{view.name}</span>
  {level && <small>{level}</small>}
  {active && <span className="selected-mark"/>}
 </button>;
}

function LevelFolder({title, level, views, activeId, navigate}: Navigation & {title: string; level: string; views: View[]}) {
 const folder = useRef<HTMLDetailsElement>(null);
 const active = views.some(view => view.id === activeId);
 useEffect(() => {
  if (active && folder.current) folder.current.open = true;
 }, [active, activeId]);

 return <details className="view-level-folder" ref={folder} open>
  <summary className="view-folder-heading" data-contains-active={active || undefined}>
   <CaretRight className="view-folder-caret" size={12} aria-hidden="true"/>
   <FolderSimple size={16} weight="duotone" aria-hidden="true"/>
   <span>{title}</span><small>{level}</small><span className="count">{views.length}</span>
  </summary>
  <div className="view-level-children">
   {views.map(view => <ViewLink key={view.id} view={view} activeId={activeId} navigate={navigate}/>)}
  </div>
 </details>;
}

export function ExplorerViews({views, activeId, navigate}: Navigation & {views: View[]}) {
 const sorted = [...views].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
 const architectureCount = sorted.filter(view => levels.some(level => level.type === view.type)).length;

 return <nav aria-label="Diagram views">
  <div className="view-group">
   <div className="group-heading"><Stack size={17}/><span>Architecture</span><span className="count">{architectureCount}</span></div>
   {levels.map(level => {
    const matches = sorted.filter(view => view.type === level.type);
    if (matches.length === 0) return null;
    if (matches.length === 1) return <ViewLink key={level.type} view={matches[0]} level={level.code} activeId={activeId} navigate={navigate}/>;
    return <LevelFolder key={level.type} title={level.title} level={level.code} views={matches} activeId={activeId} navigate={navigate}/>;
   })}
  </div>
  {categories.map(({type, title, icon: Icon}) => {
   const matches = sorted.filter(view => view.type === type);
   return <div className="view-group" key={type}>
    <div className="group-heading"><Icon size={17}/><span>{title}</span><span className="count">{matches.length}</span></div>
    {matches.map(view => <ViewLink key={view.id} view={view} activeId={activeId} navigate={navigate}/>)}
   </div>;
  })}
 </nav>;
}
