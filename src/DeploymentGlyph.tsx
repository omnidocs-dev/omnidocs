import {Cube,Database,HardDrives,ShieldCheck,TreeStructure,type Icon} from '@phosphor-icons/react';
import {deploymentTypes,type DeploymentType} from '../shared/deployment-types';

const icons={cube:Cube,storage:Database,rack:HardDrives,policy:ShieldCheck,network:TreeStructure};

export function DeploymentGlyph({type,sculpted=false,icon}: {type:DeploymentType;sculpted?:boolean;icon?:Icon}){
 const item=deploymentTypes.find(option=>option.id===type)!;
 const Symbol=icon??icons[item.shape];
 const ecosystem=type.startsWith('k8s-')?'kubernetes':'infrastructure';
 return <span className="deployment-glyph" data-shape={item.shape} data-ecosystem={ecosystem} data-resource={type} data-sculpted={sculpted||undefined} aria-hidden="true">
  <span className="deployment-glyph-front"><Symbol weight="bold"/></span>
 </span>;
}
