export default class HistoryManager {
    constructor() { 
        this.history = []; 
        this.step = -1; 
        this.maxSteps = 20; 
    }
    
    updateMaxSteps(w, h, frameCount = 1, layerCount = 1) {
        const totalPixels = (w * h) * Math.max(1, (frameCount * layerCount) / 4);
        if (totalPixels <= 16384) { 
            this.maxSteps = 60;
        } else if (totalPixels <= 65536) { 
            this.maxSteps = 40;
        } else if (totalPixels <= 500000) { 
            this.maxSteps = 20;
        } else if (totalPixels <= 5000000) { 
            this.maxSteps = 10;
        } else { 
            this.maxSteps = 6;
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
                            if (l.canvasData instanceof HTMLCanvasElement) {
                                l.canvasData.width = 0;
                                l.canvasData.height = 0;
                            }
                            l.canvasData = null;
                        }
                    });
                });
                if (droppedState.floatingCanvasData) {
                    if (droppedState.floatingCanvasData instanceof HTMLCanvasElement) {
                        droppedState.floatingCanvasData.width = 0;
                        droppedState.floatingCanvasData.height = 0;
                    }
                    droppedState.floatingCanvasData = null;
                }
                if (droppedState.origFloatingCanvasData) {
                    if (droppedState.origFloatingCanvasData instanceof HTMLCanvasElement) {
                        droppedState.origFloatingCanvasData.width = 0;
                        droppedState.origFloatingCanvasData.height = 0;
                    }
                    droppedState.origFloatingCanvasData = null;
                }
            }
        }
        if (this.step < -1) this.step = -1;
    }

    saveState(doc, selection) {
        if (!doc) return;

        if (doc.frames) {
            this.updateMaxSteps(doc.width, doc.height, doc.frames.length, (doc.activeFrame ? doc.activeFrame.layers.length : 1));
        }
        
        if (this.step < this.history.length - 1) {
            const discarded = this.history.slice(this.step + 1);
            this.history.length = this.step + 1;
            discarded.forEach(state => {
                state.frames.forEach(f => {
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
                            if (l.canvasData instanceof HTMLCanvasElement) {
                                l.canvasData.width = 0;
                                l.canvasData.height = 0;
                            }
                            l.canvasData = null;
                        }
                    });
                });
                if (state.floatingCanvasData && state.floatingCanvasData instanceof HTMLCanvasElement) {
                    state.floatingCanvasData.width = 0;
                    state.floatingCanvasData.height = 0;
                }
                if (state.origFloatingCanvasData && state.origFloatingCanvasData instanceof HTMLCanvasElement) {
                    state.origFloatingCanvasData.width = 0;
                    state.origFloatingCanvasData.height = 0;
                }
            });
            this.discardedRedo = null;
        } else {
            this.discardedRedo = null;
        }
        
        const prevState = this.step >= 0 ? this.history[this.step] : null;
        
        let floatingData = null;
        let origFloatingData = null;
        if (selection && selection.isFloating) {
            if (selection.floatingCanvas && selection.floatingCanvas.width > 0 && selection.floatingCanvas.height > 0) {
                floatingData = selection.floatingCanvas.getContext('2d').getImageData(0, 0, selection.floatingCanvas.width, selection.floatingCanvas.height);
            }
            
            if (selection.origFloatingCanvas && selection.origFloatingCanvas.width > 0 && selection.origFloatingCanvas.height > 0) {
                origFloatingData = selection.origFloatingCanvas.getContext('2d').getImageData(0, 0, selection.origFloatingCanvas.width, selection.origFloatingCanvas.height);
            }
        }

        const snapshot = {
            docWidth: doc.width,
            docHeight: doc.height,
            selectionMask: (selection && selection.isActive && selection.mask) ? new Uint8Array(selection.mask) : null,
            isFloating: selection ? selection.isFloating : false,
            floatingCanvasData: floatingData,
            origFloatingCanvasData: origFloatingData,
            transformMatrix: selection && selection.transformMatrix ? DOMMatrix.fromMatrix(selection.transformMatrix) : null,
            bounds: selection ? { ...selection.bounds } : null,
            origBounds: selection && selection.origBounds ? { ...selection.origBounds } : null,
            frames: doc.frames.map((f, fi) => ({
                layers: f.layers.map((l) => {
                    let prevLayerState = null;
                    if (prevState) { 
                        if (prevState.frames[fi]) {
                            prevLayerState = prevState.frames[fi].layers.find(pl => pl._id === l._id) || null;
                        }
                        if (!prevLayerState) {
                            for (let pf of prevState.frames) { 
                                const match = pf.layers.find(pl => pl._id === l._id); 
                                if (match) { prevLayerState = match; break; } 
                            } 
                        }
                    }
                    if (prevLayerState && prevLayerState._rev === l._rev && (prevLayerState.isDeleted || false) === (l.isDeleted || false)) {
                        return { _id: l._id, _rev: l._rev, canvasData: prevLayerState.canvasData, visible: l.visible, opacity: l.opacity, locked: l.locked, isDeleted: l.isDeleted || false, holdCount: l.holdCount || 1, _name: l._name };
                    }
                    let cloneData = null;
                    if (!l.isDeleted) {
                        if (typeof l.getSnapshotImageData === 'function') {
                            cloneData = l.getSnapshotImageData();
                        } else if (l._buffer) {
                            cloneData = l._buffer;
                        } else if (l._canvas) {
                            cloneData = l.ctx.getImageData(0, 0, l.width, l.height);
                        }
                    }
                    return { _id: l._id, _rev: l._rev, canvasData: cloneData, visible: l.visible, opacity: l.opacity, locked: l.locked, isDeleted: l.isDeleted || false, holdCount: l.holdCount || 1, _name: l._name };
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
                        if (l.canvasData instanceof HTMLCanvasElement) {
                            l.canvasData.width = 0;
                            l.canvasData.height = 0;
                        }
                        l.canvasData = null;
                    }
                });
            });
            if (state.floatingCanvasData) {
                if (state.floatingCanvasData instanceof HTMLCanvasElement) {
                    state.floatingCanvasData.width = 0;
                    state.floatingCanvasData.height = 0;
                }
                state.floatingCanvasData = null;
            }
            if (state.origFloatingCanvasData) {
                if (state.origFloatingCanvasData instanceof HTMLCanvasElement) {
                    state.origFloatingCanvasData.width = 0;
                    state.origFloatingCanvasData.height = 0;
                }
                state.origFloatingCanvasData = null;
            }
        });
        this.history = []; 
        this.step = -1; 
    }
}
