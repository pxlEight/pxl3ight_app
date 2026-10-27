import { canvas2DOptions } from '../core/Constants.js?cb=171';

// Monotonic content-version counter. Unlike _rev (which undo/redo rewinds), _ver never repeats,
// so it is safe as a cache key for thumbnails and other derived images.
let _verCounter = 0;
export function bumpVerCounter(minVal = 0) {
    if (minVal > _verCounter) _verCounter = minVal;
    return ++_verCounter;
}

export default class PixelLayer {
    constructor(w, h) {
        this.width = w;
        this.height = h;
        this._canvas = null;
        this._ctx = null;
        this._buffer = null;
        this._snapshot = null;
        this._snapshotRev = -1;
        this.visible = true; 
        this.opacity = 1.0; 
        this.locked = false; 
        this.holdCount = 1; 
        this._id = Math.random().toString(36).substr(2, 9); 
        this._rev = 0;
        this._ver = ++_verCounter;
        this.isDeleted = false;
    }
    
    get hasCanvas() {
        return !!this._canvas;
    }

    get hasContent() {
        return !!(this._canvas || this._buffer);
    }

    get isDehydrated() {
        return !this._canvas && !!this._buffer;
    }

    get canvas() {
        if (!this._canvas) {
            this._canvas = document.createElement('canvas');
            this._canvas.width = this.width;
            this._canvas.height = this.height;
            if (this._buffer) {
                if (!this._ctx) {
                    this._ctx = this._canvas.getContext('2d', canvas2DOptions());
                    this._ctx.imageSmoothingEnabled = false;
                }
                this._ctx.putImageData(this._buffer, 0, 0);
                this._snapshot = this._buffer;
                this._snapshotRev = this._rev;
                this._buffer = null;
            }
        }
        return this._canvas;
    }

    get ctx() {
        if (!this._ctx) {
            this._ctx = this.canvas.getContext('2d', canvas2DOptions());
            this._ctx.imageSmoothingEnabled = false;
        }
        return this._ctx;
    }

    getSnapshotImageData() {
        if (this.isDeleted) return null;
        if (this._buffer) return this._buffer;
        if (this._snapshotRev === this._rev) return this._snapshot;
        if (!this._canvas) return null;
        try {
            const imgData = this.ctx.getImageData(0, 0, this.width, this.height);
            const u32 = new Uint32Array(imgData.data.buffer);
            let hasPixels = false;
            for (let i = 0; i < u32.length; i++) {
                if (u32[i] !== 0) {
                    hasPixels = true;
                    break;
                }
            }
            this._snapshot = hasPixels ? imgData : null;
            this._snapshotRev = this._rev;
            return this._snapshot;
        } catch (e) {
            console.warn('Dehydration failed to get image data', e);
            return null;
        }
    }

    dehydrate() {
        if (!this._canvas) return;
        if (this.isDeleted) {
            this.destroy();
            return;
        }
        this._buffer = this.getSnapshotImageData();
        this._canvas.width = 0;
        this._canvas.height = 0;
        this._canvas = null;
        this._ctx = null;
    }

    hydrate() {
        return this.canvas;
    }

    clone() { 
        const clone = new PixelLayer(this.width, this.height); 
        if (!this.isDeleted) {
            if (this._buffer) {
                clone._buffer = this._buffer;
                clone._snapshot = this._buffer;
                clone._snapshotRev = clone._rev;
            } else if (this._canvas) {
                if (this._snapshotRev === this._rev) {
                    clone._buffer = this._snapshot;
                    clone._snapshot = this._snapshot;
                    clone._snapshotRev = clone._rev;
                } else {
                    clone.ctx.drawImage(this.canvas, 0, 0); 
                }
            }
        }
        clone.visible = this.visible; 
        clone.opacity = this.opacity; 
        clone.locked = this.locked; 
        clone.holdCount = this.holdCount; 
        clone.isDeleted = this.isDeleted;
        return clone; 
    }

    clear() { 
        if (this._canvas) {
            this.ctx.clearRect(0, 0, this.width, this.height); 
        }
        this._buffer = null;
        this.markModified(); 
        this._snapshot = null;
        this._snapshotRev = this._rev;
    }

    markModified() { 
        this.isDeleted = false;
        this._ver = ++_verCounter;
        this._rev = this._ver; 
        this._snapshot = null;
        this._snapshotRev = -1;
    }

    destroy() {
        if (this._canvas) {
            this._canvas.width = 0;
            this._canvas.height = 0;
            this._canvas = null;
            this._ctx = null;
        }
        this._buffer = null;
        this._snapshot = null;
        this._snapshotRev = -1;
    }
}
