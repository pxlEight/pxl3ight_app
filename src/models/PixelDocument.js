import PixelLayer from './PixelLayer.js';
import PixelFrame from './PixelFrame.js';

export default class PixelDocument {
    constructor(w, h, events) { 
        this.events = events; 
        this.width = w; 
        this.height = h; 
        this.frames = [new PixelFrame(w, h, 2)]; 
        this.currentFrameIndex = 0; 
        this.activeLayerIndex = 1; 
    }
    get activeFrame() { return this.frames[this.currentFrameIndex]; } 
    get activeLayer() { return this.activeFrame.layers[this.activeLayerIndex]; } 
    get activeCtx() { return this.activeLayer.ctx; }
    
    addLayer() { 
        this.frames.forEach(f => f.layers.push(new PixelLayer(this.width, this.height))); 
        this.activeLayerIndex = this.activeFrame.layers.length - 1; 
        this.events.emit('layerChanged'); 
    }
    deleteLayer() { 
        if (this.activeFrame.layers.length <= 1) return; 
        this.frames.forEach(f => f.layers.splice(this.activeLayerIndex, 1)); 
        this.activeLayerIndex = Math.min(this.activeLayerIndex, this.activeFrame.layers.length - 1); 
        this.events.emit('layerChanged'); 
    }
    duplicateActiveLayer() { 
        this.frames.forEach(f => { 
            const clone = f.layers[this.activeLayerIndex].clone(); 
            f.layers.splice(this.activeLayerIndex + 1, 0, clone); 
        }); 
        this.activeLayerIndex++; 
        this.events.emit('layerChanged'); 
    }
    mergeLayerDown() {
        if (this.activeLayerIndex <= 0) return false;
        this.frames.forEach(f => {
            const top = f.layers[this.activeLayerIndex];
            const bottom = f.layers[this.activeLayerIndex - 1];
            if (top.visible) { 
                bottom.ctx.globalAlpha = top.opacity; 
                bottom.ctx.drawImage(top.canvas, 0, 0); 
                bottom.ctx.globalAlpha = 1.0; 
                bottom.markModified(); 
            }
            f.layers.splice(this.activeLayerIndex, 1);
        });
        this.activeLayerIndex--; 
        this.events.emit('layerChanged'); 
        this.events.emit('frameChanged'); 
        return true;
    }
    addFrame() {
        const frame = new PixelFrame(this.width, this.height, 0);
        if (this.activeFrame) { 
            frame.layers = this.activeFrame.layers.map(l => { 
                const nl = new PixelLayer(this.width, this.height); 
                nl.opacity = l.opacity; 
                nl.visible = l.visible; 
                nl.locked = l.locked; 
                return nl; 
            }); 
        } else {
            frame.layers = [new PixelLayer(this.width, this.height), new PixelLayer(this.width, this.height)];
        }
        this.frames.push(frame); 
        this.currentFrameIndex = this.frames.length - 1; 
        this.events.emit('frameChanged');
    }
    deleteFrame(index) { 
        if (this.frames.length <= 1) return; 
        this.frames.splice(index, 1); 
        if (this.currentFrameIndex >= this.frames.length) {
            this.currentFrameIndex = this.frames.length - 1; 
        }
        this.events.emit('frameChanged'); 
    }
    copyFrame(index) { 
        const clone = this.frames[index].clone(); 
        this.frames.splice(index + 1, 0, clone); 
        this.currentFrameIndex = index + 1; 
        this.events.emit('frameChanged'); 
    }
}
