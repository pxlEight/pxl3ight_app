export default class WorkerManager {
    constructor() {
        const workerScript = `
            self.onmessage = function(e) {
                const { id, action, payload } = e.data;
                try {
                    if (action === 'FLOOD_FILL') {
                        const result = doFloodFill(payload);
                        self.postMessage({ id, status: 'success', payload: result }, [result.data.buffer]);
                    } else if (action === 'WAND_SELECT') {
                        const result = doWandSelect(payload);
                        self.postMessage({ id, status: 'success', payload: result }, [result.mask.buffer]);
                    } else if (action === 'COLOR_SELECT') {
                        const result = doColorSelect(payload);
                        self.postMessage({ id, status: 'success', payload: result }, [result.mask.buffer]);
                    } else if (action === 'LAYER_ADJUST') {
                        const result = doLayerAdjust(payload);
                        self.postMessage({ id, status: 'success', payload: result }, [result.buffer]);
                    }
                } catch (err) {
                    self.postMessage({ id, status: 'error', error: err.message });
                }
            };

            function doColorSelect({ buffer, w, h, mode, startColor, currentMask }) {
                const data = new Uint8ClampedArray(buffer);
                const { r: startR, g: startG, b: startB, a: startA } = startColor;
                
                const mask = new Uint8Array(currentMask);
                const fillValue = mode === 'subtract' ? 0 : 1;
                
                for (let i = 0; i < w * h; i++) {
                    const pos = i * 4;
                    if (data[pos] === startR && data[pos+1] === startG && data[pos+2] === startB && data[pos+3] === startA) {
                        mask[i] = fillValue;
                    }
                }
                
                return { mask };
            }

            function rgbToHsv(r, g, b) {
                r /= 255; g /= 255; b /= 255;
                const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
                let h, s = max === 0 ? 0 : d / max, v = max;
                if (max === min) { h = 0; }
                else {
                    switch (max) {
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h *= 60;
                }
                return { h, s, v };
            }

            function hsvToRgb(h, s, v) {
                let r, g, b;
                const i = Math.floor(h / 60);
                const f = h / 60 - i;
                const p = v * (1 - s);
                const q = v * (1 - f * s);
                const t = v * (1 - (1 - f) * s);
                switch (i % 6) {
                    case 0: r = v; g = t; b = p; break;
                    case 1: r = q; g = v; b = p; break;
                    case 2: r = p; g = v; b = t; break;
                    case 3: r = p; g = q; b = v; break;
                    case 4: r = t; g = p; b = v; break;
                    case 5: r = v; g = p; b = q; break;
                }
                return { r: r * 255, g: g * 255, b: b * 255 };
            }

            function doLayerAdjust({ buffer, hOff, sOff, vOff, contrast }) {
                const data = new Uint8ClampedArray(buffer);
                const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
                
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i+3] === 0) continue;
                    
                    let { r, g, b } = data;
                    r = data[i]; g = data[i+1]; b = data[i+2];
                    
                    if (contrast !== 0) {
                        r = contrastFactor * (r - 128) + 128;
                        g = contrastFactor * (g - 128) + 128;
                        b = contrastFactor * (b - 128) + 128;
                        r = Math.min(255, Math.max(0, r));
                        g = Math.min(255, Math.max(0, g));
                        b = Math.min(255, Math.max(0, b));
                    }
                    
                    if (hOff !== 0 || sOff !== 0 || vOff !== 0) {
                        let hsv = rgbToHsv(r, g, b);
                        
                        hsv.h = (hsv.h + hOff) % 360;
                        if (hsv.h < 0) hsv.h += 360;
                        
                        hsv.s = Math.min(1, Math.max(0, hsv.s + sOff / 100));
                        hsv.v = Math.min(1, Math.max(0, hsv.v + vOff / 100));
                        
                        let rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
                        r = rgb.r; g = rgb.g; b = rgb.b;
                    }
                    
                    data[i] = r;
                    data[i+1] = g;
                    data[i+2] = b;
                }
                
                return { buffer };
            }

            function doFloodFill({ buffer, w, h, startX, startY, fillR, fillG, fillB, fillA, alpha, isSelectionActive, selectionMask, startColor }) {
                const data = new Uint8ClampedArray(buffer);
                const invAlpha = 1 - alpha;
                const { r: startR, g: startG, b: startB, a: startA } = startColor;

                const matchStartColor = (pos, cx, cy) => {
                    if (isSelectionActive && !selectionMask[cy * w + cx]) return false;
                    return data[pos] === startR && data[pos+1] === startG && data[pos+2] === startB && data[pos+3] === startA;
                };

                const colorPixel = (pos) => {
                    if (alpha === 1.0) {
                        data[pos] = fillR; data[pos+1] = fillG; data[pos+2] = fillB; data[pos+3] = fillA;
                    } else {
                        const destR = data[pos], destG = data[pos+1], destB = data[pos+2], destA = data[pos+3];
                        if (destA === 0) {
                            data[pos] = fillR; data[pos+1] = fillG; data[pos+2] = fillB; data[pos+3] = Math.round(fillA * alpha);
                        } else {
                            data[pos] = Math.round(fillR * alpha + destR * invAlpha);
                            data[pos+1] = Math.round(fillG * alpha + destG * invAlpha);
                            data[pos+2] = Math.round(fillB * alpha + destB * invAlpha);
                            data[pos+3] = Math.min(255, destA + Math.round(fillA * alpha));
                        }
                    }
                };

                const pixelStack = [[startX, startY]];
                while (pixelStack.length) {
                    const pt = pixelStack.pop();
                    const x = pt[0];
                    let y = pt[1];
                    let pixelPos = (y * w + x) * 4;

                    while (y >= 0 && matchStartColor(pixelPos, x, y)) {
                        y--; pixelPos -= w * 4;
                    }

                    pixelPos += w * 4; y++;
                    let reachLeft = false, reachRight = false;

                    while (y < h && matchStartColor(pixelPos, x, y)) {
                        colorPixel(pixelPos);

                        if (x > 0) {
                            if (matchStartColor(pixelPos - 4, x - 1, y)) {
                                if (!reachLeft) { pixelStack.push([x - 1, y]); reachLeft = true; }
                            } else if (reachLeft) { reachLeft = false; }
                        }

                        if (x < w - 1) {
                            if (matchStartColor(pixelPos + 4, x + 1, y)) {
                                if (!reachRight) { pixelStack.push([x + 1, y]); reachRight = true; }
                            } else if (reachRight) { reachRight = false; }
                        }
                        y++; pixelPos += w * 4;
                    }
                }
                return { data };
            }

            function doWandSelect({ buffer, w, h, startX, startY, mode, startColor, currentMask }) {
                const data = new Uint8ClampedArray(buffer);
                const { r: startR, g: startG, b: startB, a: startA } = startColor;
                const matchStartColor = (pos) => data[pos] === startR && data[pos+1] === startG && data[pos+2] === startB && data[pos+3] === startA;

                const mask = new Uint8Array(currentMask);
                const visited = new Uint8Array(w * h);
                const pixelStack = [[startX, startY]];
                const fillValue = mode === 'subtract' ? 0 : 1;

                while (pixelStack.length) {
                    const pt = pixelStack.pop();
                    const x = pt[0];
                    let y = pt[1];
                    let pixelPos = (y * w + x) * 4;

                    while (y >= 0 && matchStartColor(pixelPos) && !visited[y*w+x]) {
                        y--; pixelPos -= w * 4;
                    }

                    pixelPos += w * 4; y++;
                    let reachLeft = false, reachRight = false;

                    while (y < h && matchStartColor(pixelPos) && !visited[y*w+x]) {
                        visited[y*w+x] = 1;
                        mask[y*w+x] = fillValue;

                        if (x > 0) {
                            if (matchStartColor(pixelPos - 4) && !visited[y*w+(x-1)]) {
                                if (!reachLeft) { pixelStack.push([x - 1, y]); reachLeft = true; }
                            } else if (reachLeft) { reachLeft = false; }
                        }

                        if (x < w - 1) {
                            if (matchStartColor(pixelPos + 4) && !visited[y*w+(x+1)]) {
                                if (!reachRight) { pixelStack.push([x + 1, y]); reachRight = true; }
                            } else if (reachRight) { reachRight = false; }
                        }
                        y++; pixelPos += w * 4;
                    }
                }
                return { mask };
            }
        `;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.msgId = 0;
        this.pendingTasks = new Map();

        this.worker.onmessage = (e) => {
            const { id, status, payload, error } = e.data;
            if (this.pendingTasks.has(id)) {
                const { resolve, reject } = this.pendingTasks.get(id);
                if (status === 'success') resolve(payload);
                else reject(new Error(error));
                this.pendingTasks.delete(id);
            }
        };
    }

    runTask(action, payload, transferables = []) {
        return new Promise((resolve, reject) => {
            const id = this.msgId++;
            this.pendingTasks.set(id, { resolve, reject });
            this.worker.postMessage({ id, action, payload }, transferables);
        });
    }
}
