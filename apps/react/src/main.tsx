import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@copc-test/ui/panel.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
