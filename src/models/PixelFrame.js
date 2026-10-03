import PixelLayer from './PixelLayer.js';

export default class PixelFrame {
    constructor(w, h, initialLayers = 2) { 
        this.layers = []; 
        for (let i = 0; i < initialLayers; i++) {
            this.layers.push(new PixelLayer(w, h)); 
        }
    }
    clone() { 
        const clone = new PixelFrame(0, 0, 0); 
        clone.layers = this.layers.map(l => l.clone()); 
        return clone; 
    }
}
