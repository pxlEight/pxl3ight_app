export default class HistoryManager {
    constructor() { 
        this.history = []; 
        this.step = -1; 
        this.maxSteps = 20; 
    }
    
    updateMaxSteps(w, h) {
        const pixels = w * h;
        if (pixels <= 4096) { 
            this.maxSteps = 60;
        } else if (pixels <= 16384) { 
            this.maxSteps = 40;
        } else if (pixels <= 57600) { 
            this.maxSteps = 20;
        } else { 
            this.maxSteps = 10;
        }
        this.trim();
    }

    trim() {
        while (this.history.length > this.maxSteps) {
            const droppedState = this.history.shift();
            this.step--;
            
            if (droppedState) {
                droppedState.frames.forEach(f => {
                    f.layers.forEach(l => {
                        let isReferenced = false;
                        for (let i = 0; i < this.history.length; i++) {
                            for (let sf of this.history[i].frames) {
                                for (let sl of sf.layers) {
                                    if (sl.canvasData === l.canvasData) {
                                        isReferenced = true;
                                        break;
                                    }
                                }
                                if (isReferenced) break;
                            }
                            if (isReferenced) break;
                        }
                        if (!isReferenced && l.canvasData) {
                            l.canvasData.width = 0;
                            l.canvasData.height = 0;
                        }
                    });
                });
            }
        }
        if (this.step < -1) this.step = -1;
    }

    saveState(doc, selection) {
        if (!doc) return;
        
        if (this.step < this.history.length - 1) {
            this.discardedRedo = this.history.slice(this.step + 1);
            this.history.length = this.step + 1;
        } else {
            this.discardedRedo = null;
        }
        
        const prevState = this.step >= 0 ? this.history[this.step] : null;
        
        let floatingData = null;
        let origFloatingData = null;
        if (selection && selection.isFloating) {
            const fCanvas = document.createElement('canvas');
            fCanvas.width = selection.floatingCanvas.width;
            fCanvas.height = selection.floatingCanvas.height;
            fCanvas.getContext('2d').drawImage(selection.floatingCanvas, 0, 0);
            floatingData = fCanvas;
            
            if (selection.origFloatingCanvas) {
                const oCanvas = document.createElement('canvas');
                oCanvas.width = selection.origFloatingCanvas.width;
                oCanvas.height = selection.origFloatingCanvas.height;
                oCanvas.getContext('2d').drawImage(selection.origFloatingCanvas, 0, 0);
                origFloatingData = oCanvas;
            }
        }

        const snapshot = {
            docWidth: doc.width,
            docHeight: doc.height,
            selectionMask: selection && selection.mask ? new Uint8Array(selection.mask) : null,
            isFloating: selection ? selection.isFloating : false,
            floatingCanvasData: floatingData,
            origFloatingCanvasData: origFloatingData,
            transformMatrix: selection && selection.transformMatrix ? DOMMatrix.fromMatrix(selection.transformMatrix) : null,
            bounds: selection ? { ...selection.bounds } : null,
            origBounds: selection && selection.origBounds ? { ...selection.origBounds } : null,
            frames: doc.frames.map((f) => ({
                layers: f.layers.map((l) => {
                    let prevLayerState = null;
                    if (prevState) { 
                        for (let pf of prevState.frames) { 
                            const match = pf.layers.find(pl => pl._id === l._id); 
                            if (match) { prevLayerState = match; break; } 
                        } 
                    }
                    if (prevLayerState && prevLayerState._rev === l._rev) {
                        return { _id: l._id, _rev: l._rev, canvasData: prevLayerState.canvasData, visible: l.visible, opacity: l.opacity, locked: l.locked, isDeleted: l.isDeleted || false, holdCount: l.holdCount || 1, _name: l._name };
                    }
                    const cloneCanvas = document.createElement('canvas'); 
                    cloneCanvas.width = l.canvas.width; 
                    cloneCanvas.height = l.canvas.height; 
                    cloneCanvas.getContext('2d').drawImage(l.canvas, 0, 0);
                    return { _id: l._id, _rev: l._rev, canvasData: cloneCanvas, visible: l.visible, opacity: l.opacity, locked: l.locked, isDeleted: l.isDeleted || false, holdCount: l.holdCount || 1, _name: l._name };
                })
            })),
            currentFrameIndex: doc.currentFrameIndex, 
            activeLayerIndex: doc.activeLayerIndex
        };
        
        this.history.push(snapshot); 
        this.step++; 
        this.trim();
    }
    
    undo() { 
        if (this.step > 0) { 
            this.step--; 
            return this.history[this.step]; 
        } 
        return null; 
    }
    
    redo() { 
        if (this.step < this.history.length - 1) { 
            this.step++; 
            return this.history[this.step]; 
        } 
        return null; 
    }
    
    clear() { 
        this.history.forEach(state => {
            state.frames.forEach(f => {
                f.layers.forEach(l => {
                    if (l.canvasData) {
                        l.canvasData.width = 0;
                        l.canvasData.height = 0;
                    }
                });
            });
        });
        this.history = []; 
        this.step = -1; 
    }
}
