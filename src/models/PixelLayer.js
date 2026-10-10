export default class PixelLayer {
    constructor(w, h) {
        this.width = w;
        this.height = h;
        this._canvas = null;
        this._ctx = null;
        this.visible = true; 
        this.opacity = 1.0; 
        this.locked = false; 
        this.holdCount = 1; 
        this._id = Math.random().toString(36).substr(2, 9); 
        this._rev = 0;
        this.isDeleted = false;
    }
    
    get canvas() {
        if (!this._canvas) {
            this._canvas = document.createElement('canvas');
            this._canvas.width = this.width;
            this._canvas.height = this.height;
        }
        return this._canvas;
    }

    get ctx() {
        if (!this._ctx) {
            this._ctx = this.canvas.getContext('2d', { willReadFrequently: true });
            this._ctx.imageSmoothingEnabled = false;
        }
        return this._ctx;
    }

    clone() { 
        const clone = new PixelLayer(this.width, this.height); 
        if (!this.isDeleted && this._canvas) {
            clone.ctx.drawImage(this.canvas, 0, 0); 
        }
        clone.visible = this.visible; 
        clone.opacity = this.opacity; 
        clone.locked = this.locked; 
        clone.holdCount = this.holdCount; 
        clone.isDeleted = this.isDeleted;
        return clone; 
    }

    clear() { 
        this.ctx.clearRect(0, 0, this.width, this.height); 
        this.markModified(); 
    }

    markModified() { 
        this._rev++; 
    }
}
