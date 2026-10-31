import 'vite/modulepreload-polyfill';
import { startFrontendPages } from '../bootstrap';

const stop = startFrontendPages();
if (import.meta.hot) import.meta.hot.dispose(stop);
