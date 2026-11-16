export default class HistoryManager {
    constructor(onAsyncRestore = null) { 
        this.history = []; 
        this.step = -1; 
        this.maxSteps = 60; 
        this.hotTierSize = 20;        // Keep 20 steps in the hot RAM tier
        this.prefetchChunkSize = 20;  // Load next 20 steps from cold tier at a time
        this.prefetchThreshold = 5;   // Prefetch when 5 steps away from the end of the hot tier
        this.maxHistoryBytes = 40 * 1024 * 1024; // 40 MB safe heap ceiling for iOS Safari
        this.onAsyncRestore = onAsyncRestore;

        this.dbName = 'pxl3ight_history_db';
        this.dbVersion = 1;
        this.storeName = 'cold_chunks';
        this.db = null;
        this._dbInitPromise = null;
        this._nextDataKey = 0;
        this._persistedKeys = new Set();
        this._writingKeys = new Set();
        this._generation = 0;
        this._pendingRestoreStep = -1;

        this._initDB();
    }

    _initDB() {
        if (typeof indexedDB === 'undefined') return Promise.resolve(null);
        if (this._dbInitPromise) return this._dbInitPromise;

        this._dbInitPromise = new Promise((resolve) => {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'key' });
                    }
                };
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    try {
                        const tx = db.transaction([this.storeName], 'readwrite');
                        tx.objectStore(this.storeName).clear();
                        tx.oncomplete = () => {
                            this.db = db;
                            this._manageTiers(this.step === this.history.length - 1);
                            resolve(this.db);
                        };
                        tx.onerror = () => {
                            this.db = db;
                            resolve(this.db);
                        };
                    } catch (err) {
                        this.db = db;
                        resolve(this.db);
                    }
                };
                request.onerror = () => {
                    resolve(null);
                };
            } catch (err) {
                resolve(null);
            }
        });
        return this._dbInitPromise;
    }

    _setBufferKey(buf, key) {
        if (!buf || !key) return;
        if (buf._hmKey !== key) {
            Object.defineProperty(buf, '_hmKey', {
                value: key,
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
    }

    _tagBuffer(buf) {
        if (!buf) return null;
        if (!buf._hmKey) {
            this._setBufferKey(buf, ++this._nextDataKey);
        }
        return buf._hmKey;
    }
    
    updateMaxSteps(w, h, frameCount = 1, layerCount = 1) {
        const singleFramePixels = w * h;
        const totalPixels = singleFramePixels * Math.max(1, (frameCount * layerCount) / 4);

        // Resolution-adaptive Hot Tier and Prefetch sizing:
        // Keeps Hot Tier RAM strictly <= 35-40 MB on iPhone Safari while allowing 50-80+ Cold steps in IDB.
        if (singleFramePixels <= 16384) { // <= 128x128 (~64KB/layer)
            this.hotTierSize = 20;
            this.prefetchChunkSize = 20;
            this.prefetchThreshold = 5;
        } else if (singleFramePixels <= 65536) { // <= 256x256 (~256KB/layer)
            this.hotTierSize = 20;
            this.prefetchChunkSize = 20;
            this.prefetchThreshold = 5;
        } else if (singleFramePixels <= 500000) { // ~512x512 (~1MB/layer)
            this.hotTierSize = 12;
            this.prefetchChunkSize = 8;
            this.prefetchThreshold = 3;
        } else if (singleFramePixels <= 1500000) { // ~1024x1024 (~4.2MB/layer)
            this.hotTierSize = 6;
            this.prefetchChunkSize = 4;
            this.prefetchThreshold = 2;
        } else if (singleFramePixels <= 3000000) { // 1920x1080 (~8.3MB/layer)
            this.hotTierSize = 4;
            this.prefetchChunkSize = 3;
            this.prefetchThreshold = 2;
        } else { // 4K or ultra-large (>12MB/layer)
            this.hotTierSize = 2;
            this.prefetchChunkSize = 2;
            this.prefetchThreshold = 1;
        }

        // Total steps (Hot + Cold combined in IDB):
        if (totalPixels <= 4096) { 
            this.maxSteps = 200; // 64x64 or smaller
        } else if (totalPixels <= 16384) { 
            this.maxSteps = 150; // 128x128
        } else if (totalPixels <= 65536) { 
            this.maxSteps = 100; // 256x256
        } else if (totalPixels <= 500000) { 
            this.maxSteps = 80;  // 512x512
        } else if (singleFramePixels <= 3000000) { 
            // 1920x1080 (single-frame OR multi-frame animated projects)
            // In animations, drawing a stroke only touches 1 layer on 1 frame (8.3MB in IDB).
            this.maxSteps = 60; // 4 hot in RAM + up to 56 cold in IndexedDB
        } else { 
            this.maxSteps = 30; // 4K / ultra-large documents
        }
        this.trim();
    }

    _getHotBuffersMap() {
        const map = new Map();
        for (let i = 0; i < this.history.length; i++) {
            const st = this.history[i];
            if (!st) continue;
            if (st.frames) {
                for (let f of st.frames) {
                    for (let l of f.layers) {
                        if (l.canvasData && l.dataKey) {
                            map.set(l.dataKey, l.canvasData);
                        }
                    }
                }
            }
            if (st.selectionMask && st.selectionMaskKey) {
                map.set(st.selectionMaskKey, st.selectionMask);
            }
            if (st.floatingCanvasData && st.floatingDataKey) {
                map.set(st.floatingDataKey, st.floatingCanvasData);
            }
            if (st.origFloatingCanvasData && st.origFloatingDataKey) {
                map.set(st.origFloatingDataKey, st.origFloatingCanvasData);
            }
        }
        return map;
    }

    _dehydrateState(state) {
        if (!state || state._isCold) return;
        if (state.frames) {
            for (let f of state.frames) {
                for (let l of f.layers) {
                    if (l.dataKey) {
                        l.canvasData = null;
                    }
                }
            }
        }
        if (state.selectionMaskKey) state.selectionMask = null;
        if (state.floatingDataKey) state.floatingCanvasData = null;
        if (state.origFloatingDataKey) state.origFloatingCanvasData = null;
        state._isCold = true;
    }

    _isStateAllPersisted(state) {
        if (!state) return true;
        if (state.frames) {
            for (let f of state.frames) {
                for (let l of f.layers) {
                    if (l.dataKey && !this._persistedKeys.has(l.dataKey)) return false;
                }
            }
        }
        if (state.selectionMaskKey && !this._persistedKeys.has(state.selectionMaskKey)) return false;
        if (state.floatingDataKey && !this._persistedKeys.has(state.floatingDataKey)) return false;
        if (state.origFloatingDataKey && !this._persistedKeys.has(state.origFloatingDataKey)) return false;
        return true;
    }

    _isIndexInHotWindow(idx, isAtTip = false) {
        if (idx < 0 || idx >= this.history.length) return false;
        if (isAtTip || this.step === this.history.length - 1) {
            return idx >= this.history.length - this.hotTierSize;
        }
        const maxRadius = this.hotTierSize + this.prefetchThreshold;
        return idx >= this.step - maxRadius && idx <= this.step + maxRadius;
    }

    _offloadStatesToCold(statesToOffload, isAtTip = false) {
        if (!this.db || !statesToOffload || statesToOffload.length === 0) return;

        const recordsToWrite = new Map();
        const pendingStates = [];

        for (let st of statesToOffload) {
            if (!st || st._isCold || st._hydratingPromise) continue;

            if (this._isStateAllPersisted(st)) {
                this._dehydrateState(st);
                continue;
            }

            pendingStates.push(st);

            if (st.frames) {
                for (let f of st.frames) {
                    for (let l of f.layers) {
                        if (l.dataKey && l.canvasData && !this._persistedKeys.has(l.dataKey) && !this._writingKeys.has(l.dataKey)) {
                            if (l.canvasData.data) {
                                recordsToWrite.set(l.dataKey, {
                                    key: l.dataKey,
                                    type: 'imageData',
                                    width: l.dataWidth || l.canvasData.width,
                                    height: l.dataHeight || l.canvasData.height,
                                    data: l.canvasData.data
                                });
                            }
                        }
                    }
                }
            }
            if (st.selectionMaskKey && st.selectionMask && !this._persistedKeys.has(st.selectionMaskKey) && !this._writingKeys.has(st.selectionMaskKey)) {
                recordsToWrite.set(st.selectionMaskKey, {
                    key: st.selectionMaskKey,
                    type: 'uint8',
                    data: st.selectionMask
                });
            }
            if (st.floatingDataKey && st.floatingCanvasData && !this._persistedKeys.has(st.floatingDataKey) && !this._writingKeys.has(st.floatingDataKey)) {
                if (st.floatingCanvasData.data) {
                    recordsToWrite.set(st.floatingDataKey, {
                        key: st.floatingDataKey,
                        type: 'imageData',
                        width: st.floatingWidth || st.floatingCanvasData.width,
                        height: st.floatingHeight || st.floatingCanvasData.height,
                        data: st.floatingCanvasData.data
                    });
                }
            }
            if (st.origFloatingDataKey && st.origFloatingCanvasData && !this._persistedKeys.has(st.origFloatingDataKey) && !this._writingKeys.has(st.origFloatingDataKey)) {
                if (st.origFloatingCanvasData.data) {
                    recordsToWrite.set(st.origFloatingDataKey, {
                        key: st.origFloatingDataKey,
                        type: 'imageData',
                        width: st.origFloatingWidth || st.origFloatingCanvasData.width,
                        height: st.origFloatingHeight || st.origFloatingCanvasData.height,
                        data: st.origFloatingCanvasData.data
                    });
                }
            }
        }

        if (recordsToWrite.size === 0) return;

        const gen = this._generation;
        const writtenKeys = Array.from(recordsToWrite.keys());
        for (let k of writtenKeys) this._writingKeys.add(k);

        try {
            const tx = this.db.transaction([this.storeName], 'readwrite');
            const store = tx.objectStore(this.storeName);
            for (let rec of recordsToWrite.values()) {
                store.put(rec);
            }
            tx.oncomplete = () => {
                for (let k of writtenKeys) {
                    this._writingKeys.delete(k);
                    if (gen === this._generation) {
                        this._persistedKeys.add(k);
                    }
                }
                if (gen !== this._generation) return;

                const currentlyAtTip = (this.step === this.history.length - 1);
                for (let st of pendingStates) {
                    const idx = this.history.indexOf(st);
                    if (idx !== -1 && !this._isIndexInHotWindow(idx, currentlyAtTip) && this._isStateAllPersisted(st)) {
                        this._dehydrateState(st);
                    }
                }
            };
            tx.onerror = () => {
                for (let k of writtenKeys) this._writingKeys.delete(k);
            };
        } catch (err) {
            for (let k of writtenKeys) this._writingKeys.delete(k);
        }
    }

    _applyBuffersToState(st, bufferMap) {
        if (!st) return;
        if (st.frames) {
            for (let f of st.frames) {
                for (let l of f.layers) {
                    if (l.dataKey && !l.canvasData && bufferMap.has(l.dataKey)) {
                        l.canvasData = bufferMap.get(l.dataKey);
                    }
                }
            }
        }
        if (st.selectionMaskKey && !st.selectionMask && bufferMap.has(st.selectionMaskKey)) {
            st.selectionMask = bufferMap.get(st.selectionMaskKey);
        }
        if (st.floatingDataKey && !st.floatingCanvasData && bufferMap.has(st.floatingDataKey)) {
            st.floatingCanvasData = bufferMap.get(st.floatingDataKey);
        }
        if (st.origFloatingDataKey && !st.origFloatingCanvasData && bufferMap.has(st.origFloatingDataKey)) {
            st.origFloatingCanvasData = bufferMap.get(st.origFloatingDataKey);
        }
        st._isCold = false;
    }

    _hydrateRange(startIdx, endIdx) {
        const sIdx = Math.max(0, startIdx);
        const eIdx = Math.min(this.history.length - 1, endIdx);
        if (sIdx > eIdx) return Promise.resolve();

        const statesToHydrate = [];
        const existingPromises = [];
        for (let i = sIdx; i <= eIdx; i++) {
            const st = this.history[i];
            if (!st || !st._isCold) continue;
            if (st._hydratingPromise) {
                existingPromises.push(st._hydratingPromise);
            } else {
                statesToHydrate.push(st);
            }
        }

        if (statesToHydrate.length === 0) {
            return existingPromises.length > 0 ? Promise.all(existingPromises) : Promise.resolve();
        }

        const hotBuffers = this._getHotBuffersMap();
        const missingKeys = new Set();

        for (let st of statesToHydrate) {
            if (st.frames) {
                for (let f of st.frames) {
                    for (let l of f.layers) {
                        if (l.dataKey && !l.canvasData && !hotBuffers.has(l.dataKey)) {
                            missingKeys.add(l.dataKey);
                        }
                    }
                }
            }
            if (st.selectionMaskKey && !st.selectionMask && !hotBuffers.has(st.selectionMaskKey)) {
                missingKeys.add(st.selectionMaskKey);
            }
            if (st.floatingDataKey && !st.floatingCanvasData && !hotBuffers.has(st.floatingDataKey)) {
                missingKeys.add(st.floatingDataKey);
            }
            if (st.origFloatingDataKey && !st.origFloatingCanvasData && !hotBuffers.has(st.origFloatingDataKey)) {
                missingKeys.add(st.origFloatingDataKey);
            }
        }

        if (missingKeys.size === 0) {
            for (let st of statesToHydrate) {
                this._applyBuffersToState(st, hotBuffers);
            }
            return existingPromises.length > 0 ? Promise.all(existingPromises) : Promise.resolve();
        }

        if (!this.db) {
            return Promise.resolve();
        }

        const gen = this._generation;
        const hydratePromise = new Promise((resolve) => {
            try {
                const tx = this.db.transaction([this.storeName], 'readonly');
                const store = tx.objectStore(this.storeName);

                for (let key of missingKeys) {
                    const req = store.get(key);
                    req.onsuccess = () => {
                        const rec = req.result;
                        if (!rec) return;
                        if (rec.type === 'imageData' && rec.data) {
                            const clamped = rec.data instanceof Uint8ClampedArray
                                ? new Uint8ClampedArray(rec.data)
                                : new Uint8ClampedArray(rec.data.buffer || rec.data);
                            const img = new ImageData(clamped, rec.width, rec.height);
                            this._setBufferKey(img, key);
                            hotBuffers.set(key, img);
                        } else if (rec.type === 'uint8' && rec.data) {
                            const arr = rec.data instanceof Uint8Array
                                ? new Uint8Array(rec.data)
                                : new Uint8Array(rec.data.buffer || rec.data);
                            this._setBufferKey(arr, key);
                            hotBuffers.set(key, arr);
                        }
                    };
                }

                tx.oncomplete = () => {
                    for (let st of statesToHydrate) {
                        st._hydratingPromise = null;
                        if (gen === this._generation) {
                            this._applyBuffersToState(st, hotBuffers);
                        }
                    }
                    resolve();
                };

                tx.onerror = () => {
                    for (let st of statesToHydrate) {
                        st._hydratingPromise = null;
                    }
                    resolve();
                };
            } catch (err) {
                for (let st of statesToHydrate) {
                    st._hydratingPromise = null;
                }
                resolve();
            }
        });

        for (let st of statesToHydrate) {
            st._hydratingPromise = hydratePromise;
        }

        if (existingPromises.length > 0) {
            return Promise.all([...existingPromises, hydratePromise]);
        }
        return hydratePromise;
    }

    _manageTiers(isDrawing = false) {
        if (this.history.length === 0 || this.step < 0) return;

        if (!isDrawing) {
            // 1. Check Undo direction: find highest cold (and not already hydrating) index <= this.step
            let coldEdgeBelow = -1;
            for (let i = this.step; i >= 0; i--) {
                const st = this.history[i];
                if (st && st._isCold && !st._hydratingPromise) {
                    coldEdgeBelow = i;
                    break;
                }
            }
            if (coldEdgeBelow !== -1) {
                const hotStart = coldEdgeBelow + 1;
                const stepsToColdEnd = this.step - hotStart;
                if (stepsToColdEnd <= this.prefetchThreshold) {
                    const fetchStart = Math.max(0, coldEdgeBelow - this.prefetchChunkSize + 1);
                    const fetchEnd = coldEdgeBelow;
                    this._hydrateRange(fetchStart, fetchEnd);
                }
            }

            // 2. Check Redo direction: find lowest cold (and not already hydrating) index >= this.step
            let coldEdgeAbove = -1;
            for (let i = this.step; i < this.history.length; i++) {
                const st = this.history[i];
                if (st && st._isCold && !st._hydratingPromise) {
                    coldEdgeAbove = i;
                    break;
                }
            }
            if (coldEdgeAbove !== -1) {
                const hotEnd = coldEdgeAbove - 1;
                const stepsToColdEnd = hotEnd - this.step;
                if (stepsToColdEnd <= this.prefetchThreshold) {
                    const fetchStart = coldEdgeAbove;
                    const fetchEnd = Math.min(this.history.length - 1, coldEdgeAbove + this.prefetchChunkSize - 1);
                    this._hydrateRange(fetchStart, fetchEnd);
                }
            }
        }

        // 3. Offload states outside the active hot window to Cold Tier (IndexedDB)
        if (this.db) {
            const statesToOffload = [];
            for (let i = 0; i < this.history.length; i++) {
                if (!this._isIndexInHotWindow(i, isDrawing)) {
                    const st = this.history[i];
                    if (st && !st._isCold && !st._hydratingPromise) {
                        statesToOffload.push(st);
                    }
                }
            }
            if (statesToOffload.length > 0) {
                this._offloadStatesToCold(statesToOffload, isDrawing);
            }
        }
    }

    _cleanupStates(statesToDrop) {
        if (!statesToDrop || statesToDrop.length === 0) return;
        
        // Collect all active references and dataKeys still kept in this.history
        const activeData = new Set();
        const activeKeys = new Set();
        for (let i = 0; i < this.history.length; i++) {
            const st = this.history[i];
            if (!st) continue;
            if (st.frames) {
                for (let f of st.frames) {
                    for (let l of f.layers) {
                        if (l.canvasData) activeData.add(l.canvasData);
                        if (l.dataKey) activeKeys.add(l.dataKey);
                    }
                }
            }
            if (st.selectionMaskKey) activeKeys.add(st.selectionMaskKey);
            if (st.floatingCanvasData) activeData.add(st.floatingCanvasData);
            if (st.floatingDataKey) activeKeys.add(st.floatingDataKey);
            if (st.origFloatingCanvasData) activeData.add(st.origFloatingCanvasData);
            if (st.origFloatingDataKey) activeKeys.add(st.origFloatingDataKey);
        }

        const orphanedKeys = new Set();

        for (let state of statesToDrop) {
            if (!state) continue;
            if (state.frames) {
                state.frames.forEach(f => {
                    f.layers.forEach(l => {
                        if (l.dataKey && !activeKeys.has(l.dataKey)) {
                            orphanedKeys.add(l.dataKey);
                        }
                        if (l.canvasData && !activeData.has(l.canvasData)) {
                            if (l.canvasData instanceof HTMLCanvasElement) {
                                l.canvasData.width = 0;
                                l.canvasData.height = 0;
                            }
                            l.canvasData = null;
                        }
                    });
                });
            }
            if (state.selectionMaskKey && !activeKeys.has(state.selectionMaskKey)) {
                orphanedKeys.add(state.selectionMaskKey);
            }
            if (state.floatingDataKey && !activeKeys.has(state.floatingDataKey)) {
                orphanedKeys.add(state.floatingDataKey);
            }
            if (state.floatingCanvasData && !activeData.has(state.floatingCanvasData)) {
                if (state.floatingCanvasData instanceof HTMLCanvasElement) {
                    state.floatingCanvasData.width = 0;
                    state.floatingCanvasData.height = 0;
                }
                state.floatingCanvasData = null;
            }
            if (state.origFloatingDataKey && !activeKeys.has(state.origFloatingDataKey)) {
                orphanedKeys.add(state.origFloatingDataKey);
            }
            if (state.origFloatingCanvasData && !activeData.has(state.origFloatingCanvasData)) {
                if (state.origFloatingCanvasData instanceof HTMLCanvasElement) {
                    state.origFloatingCanvasData.width = 0;
                    state.origFloatingCanvasData.height = 0;
                }
                state.origFloatingCanvasData = null;
            }
        }

        if (orphanedKeys.size > 0) {
            for (let k of orphanedKeys) {
                this._persistedKeys.delete(k);
            }
            if (this.db) {
                try {
                    const tx = this.db.transaction([this.storeName], 'readwrite');
                    const store = tx.objectStore(this.storeName);
                    for (let k of orphanedKeys) {
                        store.delete(k);
                    }
                } catch (err) {
                    // Ignore cleanup error
                }
            }
        }
    }

    getEstimatedHistoryBytes() {
        let total = 0;
        const counted = new Set();
        for (let i = 0; i < this.history.length; i++) {
            const st = this.history[i];
            if (!st || st._isCold) continue;
            if (st.frames) {
                for (let f of st.frames) {
                    for (let l of f.layers) {
                        if (l.canvasData && !counted.has(l.canvasData)) {
                            counted.add(l.canvasData);
                            if (l.canvasData.data && l.canvasData.data.byteLength) {
                                total += l.canvasData.data.byteLength;
                            }
                        }
                    }
                }
            }
            if (st.selectionMask && st.selectionMask.byteLength) {
                total += st.selectionMask.byteLength;
            }
            if (st.floatingCanvasData && st.floatingCanvasData.data && !counted.has(st.floatingCanvasData)) {
                counted.add(st.floatingCanvasData);
                total += st.floatingCanvasData.data.byteLength;
            }
            if (st.origFloatingCanvasData && st.origFloatingCanvasData.data && !counted.has(st.origFloatingCanvasData)) {
                counted.add(st.origFloatingCanvasData);
                total += st.origFloatingCanvasData.data.byteLength;
            }
        }
        return total;
    }

    trim() {
        const dropped = [];
        // 1. Trim total history by maxSteps (Hot + Cold combined)
        while (this.history.length > this.maxSteps) {
            dropped.push(this.history.shift());
            this.step--;
        }

        // 2. Manage Hot vs Cold tiers
        this._manageTiers(this.step === this.history.length - 1);

        // 3. Memory budget guard: ensure unique retained hot snapshot bytes stay within maxHistoryBytes.
        // If hot memory exceeds budget, offload older hot states to Cold tier to keep RAM safe without losing history.
        if (this.getEstimatedHistoryBytes() > this.maxHistoryBytes) {
            if (this.db) {
                const minHotFloor = Math.max(2, this.hotTierSize >> 1);
                for (let i = 0; i < this.history.length; i++) {
                    const st = this.history[i];
                    if (st && !st._isCold && !st._hydratingPromise) {
                        if (Math.abs(i - this.step) >= minHotFloor) {
                            if (this._isStateAllPersisted(st)) {
                                this._dehydrateState(st);
                            } else {
                                this._offloadStatesToCold([st], false);
                            }
                            if (this.getEstimatedHistoryBytes() <= this.maxHistoryBytes) break;
                        }
                    }
                }
            } else {
                // If IDB is not supported, drop oldest states down to safe floor to prevent Jetsam crash
                const minStepsFloor = Math.min(this.hotTierSize, Math.min(8, this.maxSteps));
                while (this.history.length > minStepsFloor && this.getEstimatedHistoryBytes() > this.maxHistoryBytes) {
                    dropped.push(this.history.shift());
                    this.step--;
                }
            }
        }

        if (dropped.length > 0) {
            this._cleanupStates(dropped);
        }

        if (this.step < -1) this.step = -1;
    }

    saveState(doc, selection) {
        if (!doc) return;

        if (doc.frames) {
            this.updateMaxSteps(doc.width, doc.height, doc.frames.length, (doc.activeFrame ? doc.activeFrame.layers.length : 1));
        }
        
        if (this.step < this.history.length - 1) {
            const discarded = this.history.slice(this.step + 1);
            this.history.length = this.step + 1;
            this._cleanupStates(discarded);
            this.discardedRedo = null;
        } else {
            this.discardedRedo = null;
        }
        
        const prevState = this.step >= 0 ? this.history[this.step] : null;
        
        let floatingData = null;
        let origFloatingData = null;
        if (selection && selection.isFloating) {
            if (selection.floatingCanvas && selection.floatingCanvas.width > 0 && selection.floatingCanvas.height > 0) {
                floatingData = selection.floatingCanvas.getContext('2d').getImageData(0, 0, selection.floatingCanvas.width, selection.floatingCanvas.height);
            }
            
            if (selection.origFloatingCanvas && selection.origFloatingCanvas.width > 0 && selection.origFloatingCanvas.height > 0) {
                origFloatingData = selection.origFloatingCanvas.getContext('2d').getImageData(0, 0, selection.origFloatingCanvas.width, selection.origFloatingCanvas.height);
            }
        }

        const selectionMask = (selection && selection.isActive && selection.mask) ? new Uint8Array(selection.mask) : null;
        const selectionMaskKey = this._tagBuffer(selectionMask);
        const floatingDataKey = this._tagBuffer(floatingData);
        const origFloatingDataKey = this._tagBuffer(origFloatingData);

        const snapshot = {
            docWidth: doc.width,
            docHeight: doc.height,
            selectionMask: selectionMask,
            selectionMaskKey: selectionMaskKey,
            isFloating: selection ? selection.isFloating : false,
            floatingCanvasData: floatingData,
            floatingDataKey: floatingDataKey,
            floatingWidth: floatingData ? floatingData.width : doc.width,
            floatingHeight: floatingData ? floatingData.height : doc.height,
            origFloatingCanvasData: origFloatingData,
            origFloatingDataKey: origFloatingDataKey,
            origFloatingWidth: origFloatingData ? origFloatingData.width : doc.width,
            origFloatingHeight: origFloatingData ? origFloatingData.height : doc.height,
            transformMatrix: selection && selection.transformMatrix ? DOMMatrix.fromMatrix(selection.transformMatrix) : null,
            bounds: selection ? { ...selection.bounds } : null,
            origBounds: selection && selection.origBounds ? { ...selection.origBounds } : null,
            _isCold: false,
            _hydratingPromise: null,
            frames: doc.frames.map((f, fi) => ({
                layers: f.layers.map((l) => {
                    let prevLayerState = null;
                    if (prevState) { 
                        if (prevState.frames[fi]) {
                            prevLayerState = prevState.frames[fi].layers.find(pl => pl._id === l._id) || null;
                        }
                        if (!prevLayerState) {
                            for (let pf of prevState.frames) { 
                                const match = pf.layers.find(pl => pl._id === l._id); 
                                if (match) { prevLayerState = match; break; } 
                            } 
                        }
                    }
                    if (prevLayerState && prevLayerState._rev === l._rev && (prevLayerState.isDeleted || false) === (l.isDeleted || false)) {
                        let reusedData = prevLayerState.canvasData;
                        if (!reusedData && !l.isDeleted && typeof l.getSnapshotImageData === 'function') {
                            reusedData = l.getSnapshotImageData();
                        }
                        const dataKey = prevLayerState.dataKey || this._tagBuffer(reusedData);
                        if (reusedData && dataKey) {
                            this._setBufferKey(reusedData, dataKey);
                        }
                        return {
                            _id: l._id,
                            _rev: l._rev,
                            canvasData: reusedData,
                            dataKey: dataKey,
                            dataWidth: prevLayerState.dataWidth || doc.width,
                            dataHeight: prevLayerState.dataHeight || doc.height,
                            visible: l.visible,
                            opacity: l.opacity,
                            locked: l.locked,
                            isDeleted: l.isDeleted || false,
                            holdCount: l.holdCount || 1,
                            _name: l._name
                        };
                    }
                    let cloneData = null;
                    if (!l.isDeleted) {
                        if (typeof l.getSnapshotImageData === 'function') {
                            cloneData = l.getSnapshotImageData();
                        } else if (l._buffer) {
                            cloneData = l._buffer;
                        } else if (l._canvas) {
                            cloneData = l.ctx.getImageData(0, 0, l.width, l.height);
                        }
                    }
                    const dataKey = this._tagBuffer(cloneData);
                    return {
                        _id: l._id,
                        _rev: l._rev,
                        canvasData: cloneData,
                        dataKey: dataKey,
                        dataWidth: cloneData ? cloneData.width : doc.width,
                        dataHeight: cloneData ? cloneData.height : doc.height,
                        visible: l.visible,
                        opacity: l.opacity,
                        locked: l.locked,
                        isDeleted: l.isDeleted || false,
                        holdCount: l.holdCount || 1,
                        _name: l._name
                    };
                })
            })),
            currentFrameIndex: doc.currentFrameIndex, 
            activeLayerIndex: doc.activeLayerIndex
        };
        
        this.history.push(snapshot); 
        this.step++; 
        this._pendingRestoreStep = -1;
        this.trim();
    }
    
    undo() { 
        if (this.step > 0) { 
            this.step--; 
            this._manageTiers(false);
            const st = this.history[this.step];
            if (st && st._isCold) {
                const targetStep = this.step;
                this._pendingRestoreStep = targetStep;
                this._hydrateRange(targetStep, targetStep).then(() => {
                    if (this._pendingRestoreStep === targetStep && this.step === targetStep && this.history[targetStep] === st && !st._isCold) {
                        this._pendingRestoreStep = -1;
                        if (typeof this.onAsyncRestore === 'function') {
                            this.onAsyncRestore(st);
                        }
                    }
                });
                return null;
            }
            this._pendingRestoreStep = -1;
            return st; 
        } 
        return null; 
    }
    
    redo() { 
        if (this.step < this.history.length - 1) { 
            this.step++; 
            this._manageTiers(false);
            const st = this.history[this.step];
            if (st && st._isCold) {
                const targetStep = this.step;
                this._pendingRestoreStep = targetStep;
                this._hydrateRange(targetStep, targetStep).then(() => {
                    if (this._pendingRestoreStep === targetStep && this.step === targetStep && this.history[targetStep] === st && !st._isCold) {
                        this._pendingRestoreStep = -1;
                        if (typeof this.onAsyncRestore === 'function') {
                            this.onAsyncRestore(st);
                        }
                    }
                });
                return null;
            }
            this._pendingRestoreStep = -1;
            return st; 
        } 
        return null; 
    }
    
    clear() { 
        this._generation++;
        this._pendingRestoreStep = -1;
        const oldHistory = this.history;
        this.history = []; 
        this.step = -1; 
        this._persistedKeys.clear();
        this._writingKeys.clear();
        this._cleanupStates(oldHistory);
        if (this.db) {
            try {
                const tx = this.db.transaction([this.storeName], 'readwrite');
                tx.objectStore(this.storeName).clear();
            } catch (err) {
                // Ignore clear error
            }
        }
    }
}
