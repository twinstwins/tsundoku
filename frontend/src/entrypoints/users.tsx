import 'vite/modulepreload-polyfill';
import { startUserDirectory } from '../bootstrap';

const stop = startUserDirectory();
if (import.meta.hot) import.meta.hot.dispose(stop);
