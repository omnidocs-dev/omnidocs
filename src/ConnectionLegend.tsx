import { useState } from 'react';
import { communicationDash, communicationProtocols } from '../shared/communication';

export function ConnectionLegend({ initiallyOpen = true,compact=false }: { initiallyOpen?: boolean;compact?:boolean }) {
 const [open, setOpen] = useState(() => initiallyOpen && window.innerWidth > 1050);
 const [compactOpen,setCompactOpen]=useState(false);
 return <details className="connection-key" open={compact?compactOpen:open} onToggle={event => (compact?setCompactOpen:setOpen)(event.currentTarget.open)}>
  <summary><span className="connection-key-mark"/>Connection legend</summary>
  <div className="connection-key-content">
   <strong>Color = protocol</strong>
   <div className="protocol-key-grid">{communicationProtocols.map(protocol => <div key={protocol.id} className="protocol-key-item">
    <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true"><path d="M1 6H24" stroke={protocol.color} strokeWidth="2.5" strokeDasharray={communicationDash({ protocol: protocol.id, mode: 'direct' })}/><path d="m23 3 5 3-5 3" fill={protocol.color}/></svg><span>{protocol.label}</span>
   </div>)}</div>
   <div className="communication-mode-key"><span><svg width="32" height="10" aria-hidden="true"><path d="M0 5H32" stroke="currentColor" strokeWidth="2"/></svg>Direct</span><span><svg width="32" height="10" aria-hidden="true"><path d="M0 5H32" stroke="currentColor" strokeWidth="2" strokeDasharray="8 5"/></svg>Via broker</span><span><svg width="32" height="10" aria-hidden="true"><path d="M0 5H32" stroke="currentColor" strokeWidth="2" strokeDasharray="3 5"/></svg>Logical notification</span></div>
   <p>Thicker lines = selected input path. Moving dots follow arrow direction. Config projection is dotted.</p>
  </div>
 </details>;
}
