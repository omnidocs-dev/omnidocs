import React from 'react';
import ReactDOM from 'react-dom/client';
import {StudioRoot} from './ServiceRoot';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './service-sketch.css';
import './editor-sketch.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><StudioRoot /></React.StrictMode>);
