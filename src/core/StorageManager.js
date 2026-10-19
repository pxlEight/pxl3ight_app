export default class StorageManager {
    constructor(core) {
        this.core = core;
        this.dbName = 'pxl3ight_db';
        this.dbVersion = 1;
        this.storeName = 'autosave';
        this.db = null;
        this.saveTimer = null;
        this.blobCache = new Map();
    }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    scheduleAutoSave(doc, state, palette) {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveActiveSession(doc, state, palette);
        }, 1200);
    }

    async saveActiveSession(doc, state, palette) {
        if (!this.db || !doc) return;

        const frameDataList = [];
        const blobPromises = [];
        const dehydratedQueue = [];

        doc.frames.forEach((frame) => {
            const layersList = [];
            frame.layers.forEach((layer) => {
                const layerData = {
                    visible: layer.visible,
                    opacity: layer.opacity,
                    locked: layer.locked,
                    isDeleted: layer.isDeleted || false,
                    holdCount: layer.holdCount || 1,
                    blob: null,
                    _id: layer._id,
                    _rev: layer._rev
                };
                layersList.push(layerData);

                if (!layer.isDeleted && layer.hasContent) {
                    const cacheKey = `${layer._id}_${layer._rev}`;
                    if (this.blobCache && this.blobCache.has(cacheKey)) {
                        layerData.blob = this.blobCache.get(cacheKey);
                    } else if (layer._canvas) {
                        const p = new Promise(resolve => {
                            layer._canvas.toBlob(b => {
                                layerData.blob = b;
                                if (b && this.blobCache) this.blobCache.set(cacheKey, b);
                                resolve();
                            }, 'image/png');
                        });
                        blobPromises.push(p);
                    } else if (layer.isDehydrated) {
                        dehydratedQueue.push({ layer, layerData, cacheKey });
                    }
                }
            });
            frameDataList.push({ layers: layersList });
        });

        if (blobPromises.length > 0) {
            await Promise.all(blobPromises);
        }
        if (dehydratedQueue.length > 0) {
            for (const item of dehydratedQueue) {
                const { layer, layerData, cacheKey } = item;
                if (this.blobCache && this.blobCache.has(cacheKey)) {
                    layerData.blob = this.blobCache.get(cacheKey);
                    continue;
                }
                const src = (layer.isDehydrated && this.core && this.core.renderer)
                    ? this.core.renderer.getDehydratedLayerCanvas(layer)
                    : layer.canvas;
                if (src) {
                    await new Promise(resolve => {
                        src.toBlob(b => {
                            layerData.blob = b;
                            if (b && this.blobCache) this.blobCache.set(cacheKey, b);
                            resolve();
                        }, 'image/png');
                    });
                }
            }
        }
        if (doc && typeof doc.virtualizeFrames === 'function') {
            doc.virtualizeFrames(this.core?.playback?.onionFramesBefore ?? 2, this.core?.playback?.onionFramesAfter ?? 2);
        }

        const sessionData = {
            id: 'current_session',
            resolution: state.resolution,
            customSwatches: palette.customSwatches,
            frames: frameDataList,
            timestamp: Date.now()
        };

        try {
            const tx = this.db.transaction([this.storeName], 'readwrite');
            const store = tx.objectStore(this.storeName);
            store.put(sessionData);
        } catch (err) {
            console.warn("StorageManager: autosave failed", err);
        }
    }

    getSavedSession() {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve(null);
            const tx = this.db.transaction([this.storeName], 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.get('current_session');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    }

    clearSession() {
        if (this.blobCache) this.blobCache.clear();
        if (!this.db) return;
        const tx = this.db.transaction([this.storeName], 'readwrite');
        tx.objectStore(this.storeName).delete('current_session');
    }
}
