import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, CornersOut } from '@phosphor-icons/react';
import type BpmnViewer from 'bpmn-js/lib/NavigatedViewer';
import type { View } from '../shared/model';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
export function BpmnCanvas({ view, onEntity }: { view: View; onEntity: (id: string) => void }) {
 const ref = useRef<HTMLDivElement>(null), viewer = useRef<BpmnViewer | null>(null), onSelect = useRef(onEntity);
 const [error, setError] = useState(''), [loading, setLoading] = useState(true);
 onSelect.current = onEntity;
 useEffect(() => {
  let cancelled = false, instance: BpmnViewer | undefined, resizeObserver: ResizeObserver | undefined;
  let resizeFrame = 0;
  setError(''); setLoading(true);
  async function load() {
   try {
    const { default: Viewer } = await import('bpmn-js/lib/NavigatedViewer');
    if (cancelled || !ref.current) return;
    instance = new Viewer({ container: ref.current }); viewer.current = instance;
    await instance.importXML(view.bpmn || '');
    if (cancelled) return;
    const canvas = instance.get('canvas');
    canvas.zoom('fit-viewport', 'auto');
    resizeObserver = new ResizeObserver(() => {
     cancelAnimationFrame(resizeFrame);
     resizeFrame = requestAnimationFrame(() => {
      if (cancelled || !ref.current?.clientWidth || !ref.current.clientHeight) return;
      canvas.resized();
     });
    });
    resizeObserver.observe(ref.current);
    const registry = instance.get('elementRegistry');
    for (const task of Object.keys(view.bindings)) if (registry.get(task)) instance.get('canvas').addMarker(task, 'linked-task');
    for (const connection of registry.getAll()) {
     if (!['bpmn:SequenceFlow', 'bpmn:MessageFlow'].includes(connection.type)) continue;
     const visual = registry.getGraphics(connection.id)?.querySelector('.djs-visual');
     const path = visual?.querySelector('path')?.getAttribute('d');
     if (!visual || !path) continue;
     const points: { x: number; y: number }[] = connection.waypoints ?? [];
     const length = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0);
     const duration = Math.max(2.5, length / 90);
     const group = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
     group.setAttribute('class', 'relation-motion'); group.setAttribute('aria-hidden', 'true');
     for (let index = 0; index < 2; index++) {
      const circle = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'relation-particle'); circle.setAttribute('r', '3');
      const motion = window.document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
      motion.setAttribute('path', path); motion.setAttribute('dur', `${duration}s`);
      motion.setAttribute('begin', `${-index * duration / 2}s`); motion.setAttribute('repeatCount', 'indefinite'); motion.setAttribute('calcMode', 'paced');
      circle.append(motion); group.append(circle);
     }
     visual.append(group);
    }
    instance.on('element.click', ({ element }: { element: { id: string } }) => { const entity = view.bindings[element.id]; if (entity) onSelect.current(entity); });
    setLoading(false);
   } catch (err) { if (!cancelled) { setError(err instanceof Error ? err.message : 'Unable to render BPMN'); setLoading(false); } }
  }
  void load();
  return () => { cancelled = true; resizeObserver?.disconnect(); cancelAnimationFrame(resizeFrame); instance?.destroy(); viewer.current = null; };
 }, [view]);
 function zoom(factor: number) { const canvas = viewer.current?.get('canvas'); if (canvas) canvas.zoom(canvas.zoom() * factor); }
 return <div className="bpmn-space"><div className="bpmn-canvas" ref={ref}/>{loading && <div className="canvas-message">Loading process diagram…</div>}{error && <div className="canvas-message error">BPMN could not be rendered: {error}</div>}
  <div className="bpmn-controls"><button aria-label="Zoom in process" onClick={() => zoom(1.2)}><Plus/></button><button aria-label="Zoom out process" onClick={() => zoom(0.8)}><Minus/></button><button aria-label="Fit process to screen" onClick={() => viewer.current?.get('canvas').zoom('fit-viewport', 'auto')}><CornersOut/></button></div>
  <div className="canvas-hint">Highlighted tasks are linked to application components. Click to inspect.</div>
 </div>;
}
