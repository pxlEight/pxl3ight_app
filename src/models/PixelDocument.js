import PixelLayer from './PixelLayer.js?cb=158';
import PixelFrame from './PixelFrame.js?cb=158';

export default class PixelDocument {
    constructor(w, h, events) { 
        this.events = events; 
        this.width = w; 
        this.height = h; 
        this.frames = [new PixelFrame(w, h, 2)]; 
        this.currentFrameIndex = 0; 
        this.activeLayerIndex = 0; 
    }
    get activeFrame() { return this.frames[this.currentFrameIndex]; } 
    get activeLayer() { 
        const frame = this.activeFrame;
        if (!frame) return null;
        const layer = frame.layers[this.activeLayerIndex];
        if (layer && layer.isDeleted) {
            for (let k = this.currentFrameIndex - 1; k >= 0; k--) {
                const prevLayer = this.frames[k]?.layers?.[this.activeLayerIndex];
                if (prevLayer && !prevLayer.isDeleted) {
                    if (k + (prevLayer.holdCount || 1) > this.currentFrameIndex) {
                        return prevLayer;
                    }
                    break;
                }
            }
        }
        return layer; 
    } 
    get activeCtx() { return this.activeLayer.ctx; }
    
    addLayer() { 
        // Index 0 is the top-most layer; insert directly above the active layer
        const insertAt = Math.max(0, Math.min(this.activeLayerIndex, this.activeFrame.layers.length));
        const curIdx = this.currentFrameIndex;
        this.frames.forEach((f, idx) => {
            const nl = new PixelLayer(this.width, this.height);
            if (idx !== 0 && idx !== curIdx) {
                nl.isDeleted = true;
            }
            f.layers.splice(insertAt, 0, nl);
            f.layers.forEach((l, i) => { l._name = `L${i + 1}`; });
        }); 
        this.activeLayerIndex = insertAt; 
        this.virtualizeFrames();
        this.events.emit('layerChanged'); 
        this.events.emit('frameChanged');
    }
    deleteLayer() { 
        if (this.activeFrame.layers.length <= 1) return; 
        this.frames.forEach(f => {
            const removed = f.layers.splice(this.activeLayerIndex, 1)[0];
            if (removed && typeof removed.destroy === 'function') removed.destroy();
            f.layers.forEach((l, i) => { l._name = `L${i + 1}`; });
        }); 
        this.activeLayerIndex = Math.min(this.activeLayerIndex, this.activeFrame.layers.length - 1); 
        this.virtualizeFrames();
        this.events.emit('layerChanged'); 
    }
    duplicateActiveLayer() { 
        // Insert the clone above the original (lower index = higher in stack); active index now points at the clone
        this.frames.forEach(f => { 
            const clone = f.layers[this.activeLayerIndex].clone(); 
            f.layers.splice(this.activeLayerIndex, 0, clone); 
            f.layers.forEach((l, i) => { l._name = `L${i + 1}`; });
        }); 
        this.virtualizeFrames();
        this.events.emit('layerChanged'); 
    }
    mergeLayerDown() {
        if (this.activeLayerIndex >= this.activeFrame.layers.length - 1) return false;
        this.frames.forEach(f => {
            const top = f.layers[this.activeLayerIndex];
            const bottom = f.layers[this.activeLayerIndex + 1];
            if (top.visible && !top.isDeleted && top.hasContent) { 
                bottom.ctx.globalAlpha = top.opacity; 
                bottom.ctx.drawImage(top.canvas, 0, 0); 
                bottom.ctx.globalAlpha = 1.0; 
                bottom.markModified(); 
                bottom.isDeleted = false;
            }
            if (top.holdCount) {
                bottom.holdCount = Math.max(bottom.holdCount || 1, top.holdCount || 1);
            }
            delete bottom._cachedOriginIndex;
            const removed = f.layers.splice(this.activeLayerIndex, 1)[0];
            if (removed && typeof removed.destroy === 'function') removed.destroy();
            f.layers.forEach((l, i) => { l._name = `L${i + 1}`; });
        });
        this.activeLayerIndex = Math.min(this.activeLayerIndex, this.activeFrame.layers.length - 1);
        this.virtualizeFrames();
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
        this.virtualizeFrames();
        this.events.emit('frameChanged');
    }
    addLayerFrame(layerIdx) {
        let endIdx = 0;
        for (let i = 0; i < this.frames.length; i++) {
            if (!this.frames[i].layers[layerIdx].isDeleted) {
                const hold = this.frames[i].layers[layerIdx].holdCount || 1;
                if (i + hold > endIdx) endIdx = i + hold;
            }
        }
        if (endIdx >= this.frames.length) {
            // Need a new global frame
            const frame = new PixelFrame(this.width, this.height, 0);
            frame.layers = this.activeFrame.layers.map((l, idx) => {
                const nl = new PixelLayer(this.width, this.height);
                nl.opacity = l.opacity;
                nl.visible = l.visible;
                nl.locked = l.locked;
                if (idx !== layerIdx) nl.isDeleted = true;
                return nl;
            });
            this.frames.push(frame);
        } else {
            // Un-delete the next frame for this layer
            const nl = new PixelLayer(this.width, this.height);
            const ref = this.activeFrame.layers[layerIdx];
            nl.opacity = ref.opacity;
            nl.visible = ref.visible;
            nl.locked = ref.locked;
            nl.isDeleted = false;
            this.frames[endIdx].layers[layerIdx] = nl;
        }
        this.virtualizeFrames();
        this.events.emit('frameChanged');
    }
    deleteLayerFrame(layerIdx, frameIdx) {
        // Shift all subsequent layer frames left
        for (let k = frameIdx; k < this.frames.length - 1; k++) {
            this.frames[k].layers[layerIdx] = this.frames[k+1].layers[layerIdx];
        }
        this.frames[this.frames.length - 1].layers[layerIdx].isDeleted = true;
        
        // Trim empty global frames from the end
        while (this.frames.length > 1) {
            const lastIdx = this.frames.length - 1;
            const lastFrame = this.frames[lastIdx];
            
            let isCovered = false;
            for (let i = 0; i < lastFrame.layers.length; i++) {
                if (!lastFrame.layers[i].isDeleted) {
                    isCovered = true;
                    break;
                }
                for (let k = lastIdx - 1; k >= 0; k--) {
                    if (!this.frames[k].layers[i].isDeleted) {
                        if (k + (this.frames[k].layers[i].holdCount || 1) > lastIdx) {
                            isCovered = true;
                        }
                        break;
                    }
                }
                if (isCovered) break;
            }
            
            if (!isCovered) {
                const removedFrame = this.frames.pop();
                if (removedFrame && removedFrame.layers) {
                    removedFrame.layers.forEach(l => {
                        if (l && typeof l.destroy === 'function') l.destroy();
                    });
                }
            } else {
                break;
            }
        }
        if (this.currentFrameIndex >= this.frames.length) {
            this.currentFrameIndex = this.frames.length - 1;
        }
        this.events.emit('frameChanged');
    }
    insertLayerFrameGap(layerIdx, frameIdx, count) {
        // Calculate the exact new maximum length required after shifting
        let maxNeededIdx = 0;
        for (let i = 0; i < this.frames.length; i++) {
            if (!this.frames[i].layers[layerIdx].isDeleted) {
                const hold = this.frames[i].layers[layerIdx].holdCount || 1;
                let newStart = i;
                if (i >= frameIdx) {
                    newStart = i + count;
                }
                if (newStart + hold > maxNeededIdx) {
                    maxNeededIdx = newStart + hold;
                }
            }
        }
        
        // Ensure the document can accommodate the new size
        const needed = maxNeededIdx - this.frames.length;
        for (let step = 0; step < needed; step++) {
            const frame = new PixelFrame(this.width, this.height, 0);
            frame.layers = this.activeFrame.layers.map((l, idx) => {
                const nl = new PixelLayer(this.width, this.height);
                nl.opacity = l.opacity;
                nl.visible = l.visible;
                nl.locked = l.locked;
                nl.isDeleted = true; // all new frames are deleted by default
                return nl;
            });
            this.frames.push(frame);
        }
        
        // Shift all layer frames right from frameIdx to make a gap
        for (let k = this.frames.length - 1; k >= frameIdx + count; k--) {
            this.frames[k].layers[layerIdx] = this.frames[k - count].layers[layerIdx];
        }
        
        // Mark the gap as deleted
        for (let k = frameIdx; k < frameIdx + count; k++) {
            const clone = this.frames[k].layers[layerIdx].clone();
            clone.isDeleted = true;
            this.frames[k].layers[layerIdx] = clone;
        }
        this.virtualizeFrames();
        this.events.emit('frameChanged');
    }
    deleteFrame(index) { 
        if (this.frames.length <= 1) return; 
        const removedFrame = this.frames.splice(index, 1)[0]; 
        if (removedFrame && removedFrame.layers) {
            removedFrame.layers.forEach(l => {
                if (l && typeof l.destroy === 'function') l.destroy();
            });
        }
        if (this.currentFrameIndex >= this.frames.length) {
            this.currentFrameIndex = this.frames.length - 1; 
        }
        this.virtualizeFrames();
        this.events.emit('frameChanged'); 
    }
    copyLayerFrame(layerIdx, frameIdx) {
        if (frameIdx < 0 || frameIdx >= this.frames.length) return;
        
        let endIdx = 0;
        for (let i = 0; i < this.frames.length; i++) {
            if (!this.frames[i].layers[layerIdx].isDeleted) {
                const hold = this.frames[i].layers[layerIdx].holdCount || 1;
                if (i + hold > endIdx) endIdx = i + hold;
            }
        }
        
        if (endIdx >= this.frames.length) {
            // Need a new global frame
            const frame = new PixelFrame(this.width, this.height, 0);
            frame.layers = this.activeFrame.layers.map((l, idx) => {
                const nl = new PixelLayer(this.width, this.height);
                nl.opacity = l.opacity;
                nl.visible = l.visible;
                nl.locked = l.locked;
                if (idx !== layerIdx) nl.isDeleted = true;
                return nl;
            });
            this.frames.push(frame);
        }
        
        // Shift all frames right from frameIdx + 1
        for (let k = this.frames.length - 1; k > frameIdx + 1; k--) {
            this.frames[k].layers[layerIdx] = this.frames[k-1].layers[layerIdx];
        }
        
        // Insert clone at frameIdx + 1
        const clone = this.frames[frameIdx].layers[layerIdx].clone();
        clone.isDeleted = false;
        this.frames[frameIdx + 1].layers[layerIdx] = clone;
        
        this.virtualizeFrames();
        this.events.emit('frameChanged');
    }
    copyFrame(index) { 
        const clone = this.frames[index].clone(); 
        this.frames.splice(index + 1, 0, clone); 
        this.currentFrameIndex = index + 1; 
        this.virtualizeFrames();
        this.events.emit('frameChanged'); 
    }

    virtualizeFrames(onionBefore = 2, onionAfter = 2) {
        const totalPixels = this.width * this.height;
        // Only virtualize for high-res projects (>=500k pixels e.g. 720p/1080p) or medium-res with >15 frames
        const shouldVirtualize = (totalPixels >= 500000) || (this.frames.length > 15 && totalPixels >= 65536);
        if (!shouldVirtualize) return;

        const keepSet = new Set();
        const cur = this.currentFrameIndex;
        const totalFrames = this.frames.length;

        // Keep current frame
        keepSet.add(cur);

        // Keep onion skin window
        const start = Math.max(0, cur - onionBefore);
        const end = Math.min(totalFrames - 1, cur + onionAfter);
        for (let i = start; i <= end; i++) {
            keepSet.add(i);
        }

        // Include hold origin frames for any held layers within the keep set
        for (const fIdx of Array.from(keepSet)) {
            const frame = this.frames[fIdx];
            if (!frame || !frame.layers) continue;
            for (let li = 0; li < frame.layers.length; li++) {
                const layer = frame.layers[li];
                if (layer && layer.isDeleted) {
                    for (let k = fIdx - 1; k >= 0; k--) {
                        const prevLayer = this.frames[k]?.layers?.[li];
                        if (prevLayer && !prevLayer.isDeleted) {
                            if (k + (prevLayer.holdCount || 1) > fIdx) {
                                keepSet.add(k);
                            }
                            break;
                        }
                    }
                }
            }
        }

        // Hydrate frames in keepSet, dehydrate frames outside keepSet
        for (let fi = 0; fi < totalFrames; fi++) {
            const frame = this.frames[fi];
            if (!frame || !frame.layers) continue;

            if (keepSet.has(fi)) {
                for (const layer of frame.layers) {
                    if (!layer.isDeleted && layer.isDehydrated) {
                        layer.hydrate();
                    }
                }
            } else {
                for (const layer of frame.layers) {
                    if (layer._canvas) {
                        layer.dehydrate();
                    }
                }
            }
        }
    }
}
