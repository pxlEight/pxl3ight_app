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
        const frame = this.doc.activeFrame; 
        if (!frame) return;
        
        frame.layers.forEach(layer => { 
            if (layer.visible) { 
                this.targetCtx.globalAlpha = layer.opacity; 
                this.targetCtx.drawImage(layer.canvas, 0, 0); 
            } 
        });
        this.targetCtx.globalAlpha = 1.0;
    }
}
