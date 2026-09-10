import 'cesium/Build/Cesium/Widgets/widgets.css';
import '../../../apps/shared/styles.css';
import App from './App.svelte';
import { mount } from 'svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;
