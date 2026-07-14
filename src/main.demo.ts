import {ensureSafeStorage} from './app/services/ensure-safe-storage';

// See src/main.ts for why this must be a dynamic import, not a static one.
ensureSafeStorage();

import('./app/bootstrap-demo');
