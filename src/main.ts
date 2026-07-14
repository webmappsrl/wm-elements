import {ensureSafeStorage} from './app/services/ensure-safe-storage';

// Static imports (including this file's own transitive ones) are ALL
// resolved and evaluated before this file's own top-level statements run —
// writing `ensureSafeStorage()` above a static `import {WmCoreModule} ...`
// would NOT make it run first. wm-core's dependency graph (localForage's own
// storage-driver detection, in particular) touches `localStorage` as a side
// effect of being imported, before any of this file's own code has a chance
// to run. A dynamic `import()` is not hoisted — it only starts evaluating
// its target graph when the expression executes — so it's the only way to
// guarantee the shim below applies first.
ensureSafeStorage();

import('./app/bootstrap-widget');
