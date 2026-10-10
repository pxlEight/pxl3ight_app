export default class PixelLayer {
    constructor(w, h) {
        this.canvas = document.createElement('canvas'); 
        this.canvas.width = w; 
        this.canvas.height = h;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); 
        this.ctx.imageSmoothingEnabled = false;
        this.visible = true; 
        this.opacity = 1.0; 
        this.locked = false; 
        this.holdCount = 1; 
        this._id = Math.random().toString(36).substr(2, 9); 
        this._rev = 0;
    }
    clone() { 
        const clone = new PixelLayer(this.canvas.width, this.canvas.height); 
        clone.ctx.drawImage(this.canvas, 0, 0); 
        clone.visible = this.visible; 
        clone.opacity = this.opacity; 
        clone.locked = this.locked; 
        clone.holdCount = this.holdCount; 
        return clone; 
    }
    clear() { 
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); 
        this.markModified(); 
    }
    markModified() { 
        this._rev++; 
    }
}
