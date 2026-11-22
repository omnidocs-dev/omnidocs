import {useId} from 'react';
import {useStore} from '@xyflow/react';

/** An axonometric ground plane in the same pan/zoom space as the diagram. */
export function DeploymentPlane(){
 const id=useId();
 const [x,y,zoom]=useStore(state=>state.transform);
 const step=52*Math.max(1,2**Math.ceil(Math.log2(0.35/zoom)));
 const horizontal=zoom*Math.sqrt(3)/2;
 const vertical=zoom/2;
 return <svg className="react-flow__background react-flow__container deployment-plane" aria-hidden="true">
  <defs>
   <pattern id={id} width={step} height={step} patternUnits="userSpaceOnUse"
    patternTransform={`matrix(${horizontal} ${vertical} ${-horizontal} ${vertical} ${x} ${y})`}>
    <path d={`M ${step} 0 H 0 V ${step}`} fill="none" strokeWidth={1/zoom}/>
   </pattern>
  </defs>
  <rect width="100%" height="100%" fill={`url(#${id})`}/>
 </svg>;
}
