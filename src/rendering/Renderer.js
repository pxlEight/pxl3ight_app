export default class Renderer {
    constructor(doc, targetCanvas) { 
        this.doc = doc; 
        this.targetCanvas = targetCanvas; 
        this.targetCtx = targetCanvas.getContext('2d', { willReadFrequently: true }); 
        this.targetCtx.imageSmoothingEnabled = false; 
        this.renderPending = false; 
    }
    render() { 
        if (this.renderPending || !this.doc) return; 
        this.renderPending = true; 
        requestAnimationFrame(() => { 
            this._doRender(); 
            this.renderPending = false; 
        }); 
    }
    _doRender() {
        if (this.targetCanvas.width !== this.doc.width) this.targetCanvas.width = this.doc.width; 
        if (this.targetCanvas.height !== this.doc.height) this.targetCanvas.height = this.doc.height;
        
        this.targetCtx.clearRect(0, 0, this.targetCanvas.width, this.targetCanvas.height);
        const frameIndex = this.doc.currentFrameIndex;
        const frame = this.doc.frames[frameIndex]; 
        if (!frame) return;
        
        for (let i = 0; i < frame.layers.length; i++) {
            let layerToDraw = frame.layers[i];
            
            if (layerToDraw.isDeleted) {
                // Look backwards to see if a previous frame's hold covers this index
                for (let k = frameIndex - 1; k >= 0; k--) {
                    const prevLayer = this.doc.frames[k].layers[i];
                    if (!prevLayer.isDeleted) {
                        if (k + (prevLayer.holdCount || 1) > frameIndex) {
                            layerToDraw = prevLayer;
                        }
                        break;
                    }
                }
            }
            
            if (layerToDraw && layerToDraw.visible && !layerToDraw.isDeleted) { 
                this.targetCtx.globalAlpha = layerToDraw.opacity; 
                this.targetCtx.drawImage(layerToDraw.canvas, 0, 0); 
            } 
        }
        this.targetCtx.globalAlpha = 1.0;
    }
}
