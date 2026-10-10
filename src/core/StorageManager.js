export default class StorageManager {
    constructor(core) {
        this.core = core;
        this.dbName = 'pxl3ight_db';
        this.dbVersion = 1;
        this.storeName = 'autosave';
        this.db = null;
        this.saveTimer = null;
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

    saveActiveSession(doc, state, palette) {
        if (!this.db || !doc) return;

        const sessionData = {
            id: 'current_session',
            resolution: state.resolution,
            customSwatches: palette.customSwatches,
            frames: doc.frames.map(frame => ({
                layers: frame.layers.map(layer => {
                    const imgData = layer.ctx.getImageData(0, 0, doc.width, doc.height);
                    return {
                        visible: layer.visible,
                        opacity: layer.opacity,
                        locked: layer.locked,
                        isDeleted: layer.isDeleted || false,
                        buffer: imgData.data.buffer
                    };
                })
            })),
            timestamp: Date.now()
        };

        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put(sessionData);
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
        if (!this.db) return;
        const tx = this.db.transaction([this.storeName], 'readwrite');
        tx.objectStore(this.storeName).delete('current_session');
    }
}
