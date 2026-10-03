import { CONSTANTS } from '../core/Constants.js';

export default class SelectionManager {
    constructor(core) {
        this.core = core; 
        this.mask = null; 
        this.isActive = false; 
        this.isFloating = false;
        this.path = new Path2D(); 
        this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        this.antsOffset = 0; 
        this.isAntsAnimating = false; 
        this.transformMatrix = new DOMMatrix();
        this.clipboard = null; 
        this.isDragging = false; 
        this.radialTimer = null; 
        this.isRadialOpen = false; 
        this.activeRadialAction = null;
        this.radialOffsets = { 'paste': { dx: 0, dy: -75 }, 'copy': { dx: -80, dy: -35 }, 'duplicate': { dx: -80, dy: 45 }, 'fliph': { dx: 80, dy: -35 }, 'flipv': { dx: 80, dy: 45 }, 'cut': { dx: 0, dy: 85 } };
        
        this.dragHandle = document.getElementById('dragHandle'); 
        this.radialMenu = document.getElementById('radialMenu');
        this.radialBtns = document.querySelectorAll('.radial-btn'); 
        this.floatingCanvas = document.getElementById('floatingCanvas');
        this.selectionCanvas = document.getElementById('selectionCanvas');
        
        this.scaleHandles = {};
        this.isScaling = false;
        this.isUniformScaling = false;
        this.advancedTransformMode = false;
        this.isRotating = false;
        this.rotationAngle = 0;
        this.lastDragHandleTapTime = 0;
        
        const handleTypes = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
        const viewport = document.getElementById('viewport');
        handleTypes.forEach(type => {
            const wrapper = document.createElement('div');
            wrapper.className = 'scale-handle-wrapper';
            wrapper.style.cssText = `position: absolute; width: 44px; height: 44px; pointer-events: auto; touch-action: none; z-index: 106; display: none; transform: translate(-50%, -50%); cursor: ${type}-resize; display: flex; align-items: center; justify-content: center;`;
            
            const h = document.createElement('div');
            h.className = 'scale-handle';
            
            let w = '16px', hght = '16px';
            if (type === 'n' || type === 's') { w = '24px'; hght = '10px'; }
            else if (type === 'w' || type === 'e') { w = '10px'; hght = '24px'; }
            
            h.style.cssText = `width: ${w}; height: ${hght}; background: rgba(173, 216, 230, 0.4); pointer-events: none; box-shadow: 0 2px 4px rgba(0,0,0,0.6);`;
            
            wrapper.appendChild(h);
            viewport.appendChild(wrapper);
            this.scaleHandles[type] = { wrapper, visual: h };
            this.bindScaleHandle(wrapper, type);
        });

        this.rotIndicator = document.createElement('div');
        this.rotIndicator.className = 'rot-indicator';
        this.rotIndicator.style.cssText = `position: absolute; pointer-events: none; z-index: 104; display: none;`;
        this.rotIndicator.innerHTML = `
            <svg width="80" height="80" style="overflow: visible;" viewBox="-40 -40 80 80">
                <path d="M 32 0 A 32 32 0 0 1 0 32" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="4,4" opacity="0.9"/>
                <path d="M 26 6 L 32 0 L 38 6" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" opacity="0.9"/>
                <path d="M 6 26 L 0 32 L 6 38" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" opacity="0.9"/>
            </svg>
        `;
        viewport.appendChild(this.rotIndicator);

        this.selectionMode = CONSTANTS.SELECT_MODE.REPLACE;
        this.selectionModifierUI = document.createElement('div');
        this.selectionModifierUI.id = 'selectionModifierUI';
        this.selectionModifierUI.innerHTML = `
            <button id="sel-add" style="margin-right:4px; width: 32px; height: 32px; font-size: 20px; font-weight: bold; background: #333; color: white; border: 1px solid #555; border-radius: 4px; cursor: pointer;">+</button>
            <button id="sel-sub" style="width: 32px; height: 32px; font-size: 20px; font-weight: bold; background: #333; color: white; border: 1px solid #555; border-radius: 4px; cursor: pointer;">-</button>
        `;
        this.selectionModifierUI.style.cssText = `
            position: absolute; display: none; z-index: 2000; 
            background: #222; border: 1px solid #555; border-radius: 6px; padding: 6px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.7); display: none; flex-direction: row; align-items: center; justify-content: center;
        `;
        document.body.appendChild(this.selectionModifierUI);
        
        const btnAdd = this.selectionModifierUI.querySelector('#sel-add');
        const btnSub = this.selectionModifierUI.querySelector('#sel-sub');
        
        btnAdd.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.selectionMode = CONSTANTS.SELECT_MODE.ADD;
            btnAdd.style.background = '#555';
            btnSub.style.background = '#333';
        });
        
        btnSub.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.selectionMode = CONSTANTS.SELECT_MODE.SUBTRACT;
            btnSub.style.background = '#555';
            btnAdd.style.background = '#333';
        });

        this.core.events.on('selection:showModifierUI', (e) => {
            this.selectionModifierUI.style.display = 'flex';
            this.selectionModifierUI.style.left = (e.clientX - 40) + 'px';
            this.selectionModifierUI.style.top = (e.clientY - 60) + 'px';
            
            this.selectionMode = CONSTANTS.SELECT_MODE.REPLACE;
            btnAdd.style.background = '#333';
            btnSub.style.background = '#333';
        });

        let modUiPointerDown = null;
        document.body.addEventListener('pointerdown', (e) => {
            if (this.selectionModifierUI && this.selectionModifierUI.style.display !== 'none' && !e.target.closest('#selectionModifierUI')) {
                modUiPointerDown = { x: e.clientX, y: e.clientY };
            } else {
                modUiPointerDown = null;
            }

            if (!this.isActive) return;
            
            const isHandle = e.target.closest('.scale-handle-wrapper');
            if (isHandle) return;

            if (this.advancedTransformMode && !e.target.closest('#dragHandle') && !e.target.closest('.widget') && !e.target.closest('.header-tools')) {
                if (this.core.state.tool.current !== CONSTANTS.TOOLS.ZOOM) {
                    this.startRotation(e);
                    return;
                }
            }

            const pos = this.core.viewport.getCanvasPos(e.clientX, e.clientY);
            let inBounds = false;
            
            if (this.isFloating && this.transformMatrix && this.origBounds) {
                const pt = this.transformMatrix.inverse().transformPoint(new DOMPoint(pos.x, pos.y));
                inBounds = pt.x >= this.origBounds.minX && pt.x <= this.origBounds.maxX && 
                           pt.y >= this.origBounds.minY && pt.y <= this.origBounds.maxY;
            } else {
                inBounds = pos.x >= this.bounds.minX && pos.x <= this.bounds.maxX && 
                           pos.y >= this.bounds.minY && pos.y <= this.bounds.maxY;
            }
            
            const isCanvas = e.target && e.target.tagName && e.target.tagName.toLowerCase() === 'canvas';
            
            if (!inBounds && !isHandle) {
                if (this.isUniformScaling) {
                    this.isUniformScaling = false;
                    this.updateDragHandle();
                }
            }
        });

        document.body.addEventListener('pointerup', (e) => {
            if (modUiPointerDown && this.selectionModifierUI && this.selectionModifierUI.style.display !== 'none') {
                const dist = Math.hypot(e.clientX - modUiPointerDown.x, e.clientY - modUiPointerDown.y);
                if (dist < 20) {
                    this.selectionModifierUI.style.display = 'none';
                    this.selectionMode = CONSTANTS.SELECT_MODE.REPLACE;
                }
            }
            modUiPointerDown = null;
        });

        this.animateAnts = this.animateAnts.bind(this); 
        this.bindEvents();
    }
    init(w, h) { 
        this.mask = new Uint8Array(w * h); 
        this.clear(false); 
    }
    anchor(recordHistory = true) {
        if (!this.isFloating || !this.core.doc) return;
        this.burnFloatOffset();
        this.core.doc.activeCtx.drawImage(this.floatingCanvas, 0, 0); 
        this.core.doc.activeLayer.markModified();
        this.floatingCanvas.style.display = 'none'; 
        this.floatingCanvas.getContext('2d').clearRect(0, 0, this.core.bgCanvas.width, this.core.bgCanvas.height);
        this.isFloating = false;
        if (recordHistory) { 
            if(this.core.renderer) this.core.renderer.render(); 
            this.core.saveState(); 
            this.core.events.emit('frameChanged'); 
            this.core.playback.updateOnionSkin(); 
        }
    }
    clear(recordHistory = true) {
        this.anchor(recordHistory); 
        if(this.mask) this.mask.fill(0);
        this.isActive = false; 
        this.transformMatrix = new DOMMatrix();
        this.isUniformScaling = false;
        this.advancedTransformMode = false;
        this.selectionMode = CONSTANTS.SELECT_MODE.REPLACE;
        if (this.selectionModifierUI) this.selectionModifierUI.style.display = 'none';
        this.rebuildPath();
        if (recordHistory) {
            this.core.saveState();
        }
    }
    rebuildPath() {
        this.path = new Path2D(); 
        this.bounds = { minX: 9999, minY: 9999, maxX: -1, maxY: -1 };
        if(!this.core.bgCanvas) return;
        
        const w = this.core.bgCanvas.width;
        const h = this.core.bgCanvas.height; 
        let hasSelection = false;
        
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                if (this.mask[y*w + x]) {
                    hasSelection = true;
                    if (x < this.bounds.minX) this.bounds.minX = x; 
                    if (x > this.bounds.maxX) this.bounds.maxX = x;
                    if (y < this.bounds.minY) this.bounds.minY = y; 
                    if (y > this.bounds.maxY) this.bounds.maxY = y;
                }
            }
        }
        
        this.isActive = hasSelection; 
        
        if (hasSelection) {
            const edges = new Map();
            const addEdge = (x1, y1, x2, y2) => {
                const k1 = y1 * (w + 1) + x1;
                const k2 = y2 * (w + 1) + x2;
                if (!edges.has(k1)) edges.set(k1, []);
                edges.get(k1).push(k2);
            };

            for(let y = this.bounds.minY; y <= this.bounds.maxY; y++) {
                for(let x = this.bounds.minX; x <= this.bounds.maxX; x++) {
                    if (this.mask[y*w + x]) {
                        if (y === 0 || !this.mask[(y-1)*w + x]) addEdge(x, y, x+1, y);
                        if (y === h-1 || !this.mask[(y+1)*w + x]) addEdge(x+1, y+1, x, y+1);
                        if (x === 0 || !this.mask[y*w + (x-1)]) addEdge(x, y+1, x, y);
                        if (x === w-1 || !this.mask[y*w + (x+1)]) addEdge(x+1, y, x+1, y+1);
                    }
                }
            }
            
            for (let [startNode, nextNodes] of edges.entries()) {
                while (nextNodes.length > 0) {
                    let curr = startNode;
                    let next = nextNodes.pop();
                    
                    const startX = curr % (w + 1);
                    const startY = Math.floor(curr / (w + 1));
                    this.path.moveTo(startX, startY);
                    
                    while (true) {
                        const nx = next % (w + 1);
                        const ny = Math.floor(next / (w + 1));
                        this.path.lineTo(nx, ny);
                        
                        curr = next;
                        const potentialNexts = edges.get(curr);
                        if (!potentialNexts || potentialNexts.length === 0) break;
                        
                        next = potentialNexts.pop();
                    }
                }
            }
        }
        
        this.updateDragHandle();
        if (this.isActive && !this.isAntsAnimating) { 
            this.isAntsAnimating = true; 
            requestAnimationFrame(this.animateAnts); 
        }
    }
    
    startRotation(e) {
        if (!this.core.doc) return;
        if (!this.isFloating) {
            this.floatSelection();
        }
        
        this.isRotating = true;
        
        const dragHandleRect = this.dragHandle.getBoundingClientRect();
        this.rotOriginX = dragHandleRect.left + dragHandleRect.width / 2;
        this.rotOriginY = dragHandleRect.top + dragHandleRect.height / 2;
        
        this.startRotAngle = Math.atan2(e.clientY - this.rotOriginY, e.clientX - this.rotOriginX);
        
        this.baseMatrix = this.transformMatrix ? DOMMatrix.fromMatrix(this.transformMatrix) : new DOMMatrix();
        
        if (!this.onRotateMoveBound) {
            this.onRotateMoveBound = this.onRotateMove.bind(this);
            this.onRotateUpBound = this.onRotateUp.bind(this);
        }
        
        document.body.addEventListener('pointermove', this.onRotateMoveBound);
        document.body.addEventListener('pointerup', this.onRotateUpBound);
        document.body.addEventListener('pointercancel', this.onRotateUpBound);
    }
    
    onRotateMove(e) {
        if (!this.isRotating) return;
        const currentAngle = Math.atan2(e.clientY - this.rotOriginY, e.clientX - this.rotOriginX);
        const diff = currentAngle - this.startRotAngle;
        
        const cx = this.origBounds.minX + (this.origBounds.maxX - this.origBounds.minX) / 2 + 0.5;
        const cy = this.origBounds.minY + (this.origBounds.maxY - this.origBounds.minY) / 2 + 0.5;
        
        this.transformMatrix = this.baseMatrix.multiply(
            new DOMMatrix()
                .translate(cx, cy)
                .rotate(diff * 180 / Math.PI)
                .translate(-cx, -cy)
        );
            
        this.previewTransform();
        this.updateDragHandle();
    }
    
    onRotateUp(e) {
        this.isRotating = false;
        document.body.removeEventListener('pointermove', this.onRotateMoveBound);
        document.body.removeEventListener('pointerup', this.onRotateUpBound);
        document.body.removeEventListener('pointercancel', this.onRotateUpBound);
    }
    


    updateDragHandle() {
        if (!this.isActive || this.core.state.isSpriteSheetView) { 
            this.dragHandle.style.display = 'none'; 
            this.radialMenu.style.display = 'none'; 
            if (this.rotIndicator) this.rotIndicator.style.display = 'none';
            for (let t in this.scaleHandles) this.scaleHandles[t].wrapper.style.display = 'none';
            return; 
        }
        
        let cx, cy, minX, minY, maxX, maxY;
        if (this.isFloating && this.origBounds) {
            cx = this.origBounds.minX + (this.origBounds.maxX - this.origBounds.minX) / 2 + 0.5;
            cy = this.origBounds.minY + (this.origBounds.maxY - this.origBounds.minY) / 2 + 0.5;
            minX = this.origBounds.minX;
            minY = this.origBounds.minY;
            maxX = this.origBounds.maxX + 1;
            maxY = this.origBounds.maxY + 1;
        } else {
            cx = this.bounds.minX + (this.bounds.maxX - this.bounds.minX) / 2 + 0.5;
            cy = this.bounds.minY + (this.bounds.maxY - this.bounds.minY) / 2 + 0.5;
            minX = this.bounds.minX;
            minY = this.bounds.minY;
            maxX = this.bounds.maxX + 1;
            maxY = this.bounds.maxY + 1;
        }
        
        let transformAngle = 0;
        let pCx = new DOMPoint(cx, cy);
        let posMap = {};
        
        if (this.isFloating && this.transformMatrix) {
            pCx = this.transformMatrix.transformPoint(pCx);
            // approximate angle for visual rotation of handles
            transformAngle = Math.atan2(this.transformMatrix.b, this.transformMatrix.a);
        }
        
        this.dragHandle.style.display = 'flex';
        const metrics = this.core.viewport.getMetrics();
        const cssX = metrics.offsetX + (pCx.x * metrics.scaleX);
        const cssY = metrics.offsetY + (pCx.y * metrics.scaleY);
        
        this.dragHandle.style.left = cssX + 'px'; 
        this.dragHandle.style.top = cssY + 'px'; 
        this.dragHandle.style.transform = `translate(-50%, -50%) scale(${1 / this.core.viewport.scale}) rotate(${transformAngle}rad)`;
        
        const getCssPos = (lx, ly) => {
            let pt = new DOMPoint(lx, ly);
            if (this.isFloating && this.transformMatrix) pt = this.transformMatrix.transformPoint(pt);
            return {
                x: metrics.offsetX + (pt.x * metrics.scaleX),
                y: metrics.offsetY + (pt.y * metrics.scaleY)
            };
        };

        posMap = {
            'nw': getCssPos(minX, minY),
            'n': getCssPos(minX + (maxX - minX)/2, minY),
            'ne': getCssPos(maxX, minY),
            'w': getCssPos(minX, minY + (maxY - minY)/2),
            'e': getCssPos(maxX, minY + (maxY - minY)/2),
            'sw': getCssPos(minX, maxY),
            's': getCssPos(minX + (maxX - minX)/2, maxY),
            'se': getCssPos(maxX, maxY)
        };

        for (let type in this.scaleHandles) {
            const obj = this.scaleHandles[type];
            if (this.advancedTransformMode) {
                obj.wrapper.style.display = 'flex';
                obj.wrapper.style.left = posMap[type].x + 'px';
                obj.wrapper.style.top = posMap[type].y + 'px';
                obj.wrapper.style.transform = `translate(-50%, -50%) scale(${1 / this.core.viewport.scale}) rotate(${transformAngle}rad)`;
                obj.visual.style.backgroundColor = this.isUniformScaling ? 'rgba(255, 215, 0, 0.4)' : 'rgba(173, 216, 230, 0.4)';
            } else {
                obj.wrapper.style.display = 'none';
            }
        }
        
        if (this.advancedTransformMode) {
            this.rotIndicator.style.display = 'block';
            this.rotIndicator.style.left = cssX + 'px';
            this.rotIndicator.style.top = cssY + 'px';
            this.rotIndicator.style.transform = `translate(-50%, -50%) scale(${1 / this.core.viewport.scale}) rotate(${transformAngle}rad)`;
        } else {
            this.rotIndicator.style.display = 'none';
        }
    }
    applyTransformToMask(matrix) {
        const w = this.core.bgCanvas.width;
        const h = this.core.bgCanvas.height;
        const newMask = new Uint8Array(w * h);
        
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = w; maskCanvas.height = h;
        const mCtx = maskCanvas.getContext('2d');
        const mData = mCtx.createImageData(w, h);
        for(let i=0; i<this.mask.length; i++) {
            if(this.mask[i]) {
                mData.data[i*4] = 255;
                mData.data[i*4+3] = 255;
            }
        }
        mCtx.putImageData(mData, 0, 0);
        
        const temp = document.createElement('canvas');
        temp.width = w; temp.height = h;
        const tCtx = temp.getContext('2d');
        tCtx.imageSmoothingEnabled = false;
        
        tCtx.setTransform(matrix);
        tCtx.drawImage(maskCanvas, 0, 0);
        
        const rmData = tCtx.getImageData(0,0,w,h).data;
        for (let i=0; i<this.mask.length; i++) {
            if (rmData[i*4+3] > 128) {
                newMask[i] = 1;
            }
        }
        this.mask = newMask;
        this.rebuildPath();
    }
    previewTransform() {
        if (!this.isFloating || !this.origFloatingCanvas) return;
        const w = this.floatingCanvas.width;
        const h = this.floatingCanvas.height;
        const fCtx = this.floatingCanvas.getContext('2d', { willReadFrequently: true });
        fCtx.clearRect(0, 0, w, h);
        fCtx.imageSmoothingEnabled = false;
        fCtx.setTransform(this.transformMatrix);
        fCtx.drawImage(this.origFloatingCanvas, 0, 0);
        fCtx.resetTransform();
    }
    
    burnFloatOffset() {
        if (!this.isFloating) return;
        if (!this.transformMatrix || this.transformMatrix.isIdentity) return;
        
        // The floatingCanvas already contains the rasterized pixels from previewTransform()
        // We just need to apply the transform to the mask
        this.applyTransformToMask(this.transformMatrix);
        
        this.transformMatrix = new DOMMatrix();
        this.origBounds = { ...this.bounds };
        
        if (this.origFloatingCanvas) {
            const oCtx = this.origFloatingCanvas.getContext('2d');
            oCtx.clearRect(0, 0, this.origFloatingCanvas.width, this.origFloatingCanvas.height);
            oCtx.drawImage(this.floatingCanvas, 0, 0);
        }
    }
    floatSelection() {
        if (this.isFloating || !this.core.doc) return;
        this.isFloating = true; 
        const w = this.core.doc.width;
        const h = this.core.doc.height;
        
        this.transformMatrix = new DOMMatrix();
        this.origBounds = { ...this.bounds };
        
        this.floatingCanvas.width = w; 
        this.floatingCanvas.height = h; 
        this.floatingCanvas.style.display = 'block'; 
        
        const fCtx = this.floatingCanvas.getContext('2d', { willReadFrequently: true }); 
        fCtx.clearRect(0,0,w,h);
        const aData = this.core.doc.activeCtx.getImageData(0,0,w,h);
        const fData = fCtx.createImageData(w,h);
        
        for(let i=0; i<this.mask.length; i++) {
            if (this.mask[i]) { 
                fData.data[i*4] = aData.data[i*4]; 
                fData.data[i*4+1] = aData.data[i*4+1]; 
                fData.data[i*4+2] = aData.data[i*4+2]; 
                fData.data[i*4+3] = aData.data[i*4+3]; 
                aData.data[i*4+3] = 0; 
            }
        }
        fCtx.putImageData(fData, 0, 0); 
        
        this.origFloatingCanvas = document.createElement('canvas');
        this.origFloatingCanvas.width = w;
        this.origFloatingCanvas.height = h;
        this.origFloatingCanvas.getContext('2d').drawImage(this.floatingCanvas, 0, 0);
        
        this.core.doc.activeCtx.putImageData(aData, 0, 0);
        this.core.doc.activeLayer.markModified();
        
        if(this.core.renderer) this.core.renderer.render(); 
        this.core.playback.updateOnionSkin(); 
        this.core.saveState();
    }
    radialCopy() {
        if (!this.isFloating) return; 
        this.burnFloatOffset();
        const clipC = document.createElement('canvas'); 
        clipC.width = this.floatingCanvas.width; 
        clipC.height = this.floatingCanvas.height;
        clipC.getContext('2d').drawImage(this.floatingCanvas, 0, 0);
        
        this.clipboard = {
            canvas: clipC,
            mask: new Uint8Array(this.mask),
            bounds: { 
                minX: this.bounds.minX, 
                maxX: this.bounds.maxX, 
                minY: this.bounds.minY, 
                maxY: this.bounds.maxY 
            }
        };
    }
    radialDuplicate() {
        if (!this.core.doc) return;
        if (!this.isFloating) this.floatSelection();
        if (!this.isFloating) return;
        
        this.radialCopy(); 
        this.core.doc.activeCtx.drawImage(this.floatingCanvas, 0, 0); 
        this.core.doc.activeLayer.markModified();
        
        if (!this.core.state.isSpriteSheetView) { 
            if(this.core.renderer) this.core.renderer.render(); 
            this.core.saveState(); 
            this.core.events.emit('frameChanged'); 
            this.core.playback.updateOnionSkin(); 
        }
    }
    radialPaste() {
        if (!this.clipboard || !this.core.doc) return;
        this.anchor(); 
        this.isFloating = true; 
        this.floatingCanvas.width = this.core.bgCanvas.width; 
        this.floatingCanvas.height = this.core.bgCanvas.height;
        this.floatingCanvas.style.display = 'block'; 
        this.transformMatrix = new DOMMatrix();
        
        const fCtx = this.floatingCanvas.getContext('2d', { willReadFrequently: true }); 
        fCtx.clearRect(0,0,this.floatingCanvas.width, this.floatingCanvas.height);
        
        let targetCx = this.core.bgCanvas.width / 2;
        let targetCy = this.core.bgCanvas.height / 2;
        if (this.isActive) { 
            targetCx = this.bounds.minX + (this.bounds.maxX - this.bounds.minX + 1) / 2; 
            targetCy = this.bounds.minY + (this.bounds.maxY - this.bounds.minY + 1) / 2; 
        }
        const clipCx = this.clipboard.bounds.minX + (this.clipboard.bounds.maxX - this.clipboard.bounds.minX + 1) / 2;
        const clipCy = this.clipboard.bounds.minY + (this.clipboard.bounds.maxY - this.clipboard.bounds.minY + 1) / 2;
        const dx = Math.round(targetCx - clipCx);
        const dy = Math.round(targetCy - clipCy); 
        
        fCtx.drawImage(this.clipboard.canvas, dx, dy);
        
        const w = this.core.bgCanvas.width;
        const h = this.core.bgCanvas.height; 
        this.mask = new Uint8Array(w * h);
        for(let y=0; y<h; y++) { 
            for(let x=0; x<w; x++) { 
                if (this.clipboard.mask[y*w+x]) { 
                    let nx = x + dx, ny = y + dy; 
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) this.mask[ny*w+nx] = 1; 
                } 
            } 
        }
        
        this.origFloatingCanvas = document.createElement('canvas');
        this.origFloatingCanvas.width = w;
        this.origFloatingCanvas.height = h;
        this.origFloatingCanvas.getContext('2d').drawImage(this.floatingCanvas, 0, 0);
        
        this.rebuildPath();
        this.origBounds = { ...this.bounds };
    }
    radialCut() {
        if (!this.isFloating) return;
        this.radialCopy(); 
        this.floatingCanvas.getContext('2d').clearRect(0, 0, this.floatingCanvas.width, this.floatingCanvas.height);
        this.floatingCanvas.style.display = 'none'; 
        this.isFloating = false; 
        if (this.mask) this.mask.fill(0);
        this.isActive = false; 
        this.rebuildPath();
        if (!this.core.state.isSpriteSheetView) { 
            if(this.core.renderer) this.core.renderer.render(); 
            this.core.saveState(); 
            this.core.events.emit('frameChanged'); 
            this.core.playback.updateOnionSkin(); 
        }
    }
    radialFlip(axis) {
        if (!this.isFloating) return;
        this.burnFloatOffset();
        const cx = this.bounds.minX + (this.bounds.maxX - this.bounds.minX + 1) / 2;
        const cy = this.bounds.minY + (this.bounds.maxY - this.bounds.minY + 1) / 2;
        
        const tempC = document.createElement('canvas'); 
        tempC.width = this.floatingCanvas.width; 
        tempC.height = this.floatingCanvas.height; 
        const tCtx = tempC.getContext('2d');
        
        tCtx.translate(cx, cy); 
        if (axis === CONSTANTS.MIRROR.H) tCtx.scale(-1, 1); else tCtx.scale(1, -1); 
        tCtx.translate(-cx, -cy); 
        tCtx.drawImage(this.floatingCanvas, 0, 0);
        
        const fCtx = this.floatingCanvas.getContext('2d', { willReadFrequently: true }); 
        fCtx.clearRect(0,0,this.floatingCanvas.width, this.floatingCanvas.height); 
        fCtx.drawImage(tempC, 0, 0);
        
        if (this.origFloatingCanvas) {
            this.origFloatingCanvas.getContext('2d').clearRect(0, 0, this.origFloatingCanvas.width, this.origFloatingCanvas.height);
            this.origFloatingCanvas.getContext('2d').drawImage(this.floatingCanvas, 0, 0);
        }
        
        const newMask = new Uint8Array(this.mask.length);
        const w = this.core.bgCanvas.width;
        const h = this.core.bgCanvas.height;
        
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                if (this.mask[y*w+x]) { 
                    let nx = axis === CONSTANTS.MIRROR.H ? (this.bounds.minX + this.bounds.maxX - x) : x;
                    let ny = axis === CONSTANTS.MIRROR.V ? (this.bounds.minY + this.bounds.maxY - y) : y; 
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        newMask[ny*w+nx] = 1; 
                    }
                }
            }
        }
        this.mask = newMask; 
        this.rebuildPath();
        
        if (!this.core.state.isSpriteSheetView) {
            if(this.core.renderer) this.core.renderer.render();
            this.core.saveState();
            this.core.events.emit('frameChanged');
        }
    }
    animateAnts() {
        if (!this.isAntsAnimating) { 
            if (this.selectionCanvas.width > 0) { 
                this.selectionCanvas.getContext('2d').clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height); 
                this.selectionCanvas.width = 0; 
            } 
            return; 
        }
        
        if (this.isActive && !this.core.state.isSpriteSheetView) {
            const w = this.core.bgCanvas.width;
            const h = this.core.bgCanvas.height;
            
            if (!this.core.viewport.cachedBgRect) this.core.viewport.updateCache();
            const rect = this.core.viewport.cachedBgRect;
            const canvasRatio = w / h;
            const rectRatio = rect.width / rect.height; 
            
            let actualRenderedWidth = rect.width; 
            if (canvasRatio < rectRatio) {
                actualRenderedWidth = rect.height * canvasRatio;
            }
            
            const internalScale = Math.ceil(Math.max(1, actualRenderedWidth / w));
            const targetW = w * internalScale;
            const targetH = h * internalScale;
            
            if (this.selectionCanvas.width !== targetW) this.selectionCanvas.width = targetW; 
            if (this.selectionCanvas.height !== targetH) this.selectionCanvas.height = targetH;
            
            const ctx = this.selectionCanvas.getContext('2d'); 
            ctx.clearRect(0, 0, targetW, targetH); 
            ctx.save(); 
            ctx.scale(internalScale, internalScale);
            
            if (this.isFloating && this.transformMatrix) {
                ctx.transform(
                    this.transformMatrix.a, this.transformMatrix.b,
                    this.transformMatrix.c, this.transformMatrix.d,
                    this.transformMatrix.e, this.transformMatrix.f
                );
            }
            
            const artUnitsPerScreenPixel = w / actualRenderedWidth;
            const strokeThickness = artUnitsPerScreenPixel * 1.5;
            const dashLength = artUnitsPerScreenPixel * 5; 
            
            ctx.lineWidth = strokeThickness; 
            ctx.strokeStyle = '#AAAAAA'; 
            ctx.setLineDash([dashLength, dashLength]); 
            ctx.lineDashOffset = -this.antsOffset * artUnitsPerScreenPixel; 
            ctx.stroke(this.path);
            
            ctx.strokeStyle = '#ffffff'; 
            ctx.lineDashOffset = (-this.antsOffset * artUnitsPerScreenPixel) + dashLength; 
            ctx.stroke(this.path);
            
            ctx.restore(); 
            this.antsOffset += 0.25; 
            requestAnimationFrame(this.animateAnts);
        } else {
            this.isAntsAnimating = false; 
            if (this.selectionCanvas.width > 0) { 
                this.selectionCanvas.getContext('2d').clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height); 
                this.selectionCanvas.width = 0; 
            }
        }
    }
    bindScaleHandle(wrapper, type) {
        let startClientX, startClientY;

        wrapper.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (!this.core.doc) return;

            if (!this.isFloating) {
                this.floatSelection();
            }

            this.isScaling = true;
            this.isUniformScaling = false;
            wrapper.setPointerCapture(e.pointerId);

            startClientX = e.clientX;
            startClientY = e.clientY;
            
            this.baseMatrix = this.transformMatrix ? DOMMatrix.fromMatrix(this.transformMatrix) : new DOMMatrix();

            this.scaleTimer = setTimeout(() => {
                this.isUniformScaling = true;
                for (let t in this.scaleHandles) {
                    this.scaleHandles[t].visual.style.backgroundColor = 'rgba(255, 215, 0, 0.4)';
                }
            }, 500);

            const onMove = (em) => {
                if (Math.abs(em.clientX - startClientX) > 4 || Math.abs(em.clientY - startClientY) > 4) {
                    clearTimeout(this.scaleTimer);
                }

                const metrics = this.core.viewport.getMetrics();
                
                const pdx = em.clientX - startClientX;
                const pdy = em.clientY - startClientY;
                const dxCanvas = pdx / metrics.scaleX / this.core.viewport.scale;
                const dyCanvas = pdy / metrics.scaleY / this.core.viewport.scale;
                
                const angle = Math.atan2(this.baseMatrix.b, this.baseMatrix.a);
                const ldx = dxCanvas * Math.cos(-angle) - dyCanvas * Math.sin(-angle);
                const ldy = dxCanvas * Math.sin(-angle) + dyCanvas * Math.cos(-angle);
                
                const w = this.origBounds.maxX - this.origBounds.minX + 1;
                const h = this.origBounds.maxY - this.origBounds.minY + 1;
                
                let sx = 1; let sy = 1;
                let pivotX = this.origBounds.minX + w/2; 
                let pivotY = this.origBounds.minY + h/2;
                
                if (type.includes('w')) { sx = (w - ldx) / w; pivotX = this.origBounds.maxX + 1; }
                if (type.includes('e')) { sx = (w + ldx) / w; pivotX = this.origBounds.minX; }
                if (type.includes('n')) { sy = (h - ldy) / h; pivotY = this.origBounds.maxY + 1; }
                if (type.includes('s')) { sy = (h + ldy) / h; pivotY = this.origBounds.minY; }
                
                if (this.isUniformScaling) {
                    const aspect = w / h;
                    if (type === 'n' || type === 's') { sx = sy; }
                    else if (type === 'w' || type === 'e') { sy = sx; }
                    else {
                        const maxS = Math.max(Math.abs(sx), Math.abs(sy));
                        sx = sx < 0 ? -maxS : maxS;
                        sy = sy < 0 ? -maxS : maxS;
                    }
                }
                
                this.transformMatrix = this.baseMatrix.multiply(
                    new DOMMatrix().translate(pivotX, pivotY).scale(sx, sy).translate(-pivotX, -pivotY)
                );
                
                this.previewTransform();
                this.updateDragHandle();
            };

            const onUp = (eu) => {
                clearTimeout(this.scaleTimer);
                wrapper.releasePointerCapture(eu.pointerId);
                wrapper.removeEventListener('pointermove', onMove);
                wrapper.removeEventListener('pointerup', onUp);
                wrapper.removeEventListener('pointercancel', onUp);
                this.isScaling = false;
            };

            wrapper.addEventListener('pointermove', onMove);
            wrapper.addEventListener('pointerup', onUp);
            wrapper.addEventListener('pointercancel', onUp);
        });
    }
    bindEvents() {
        this.dragHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); 
            if (!this.core.doc) return;
            
            const now = Date.now();
            if (now - this.lastDragHandleTapTime < 300) {
                this.lastDragHandleTapTime = 0;
                this.advancedTransformMode = !this.advancedTransformMode;
                this.updateDragHandle();
                return;
            }
            this.lastDragHandleTapTime = now;
            
            if (!this.isFloating) {
                this.floatSelection();
            }
            this.isDragging = true; 
            this.isRadialOpen = false; 
            this.activeRadialAction = null; 
            this.dragHandle.setPointerCapture(e.pointerId);
            
            const startPos = this.core.viewport.getCanvasPos(e.clientX, e.clientY);
            this.baseMatrix = this.transformMatrix ? DOMMatrix.fromMatrix(this.transformMatrix) : new DOMMatrix();
            const startClientX = e.clientX;
            const startClientY = e.clientY;
            
            this.radialTimer = setTimeout(() => {
                this.isRadialOpen = true; 
                this.isDragging = false; 
                this.radialMenu.style.display = 'block'; 
                this.radialMenu.style.left = this.dragHandle.style.left;
                this.radialMenu.style.top = this.dragHandle.style.top; 
                this.radialMenu.style.transform = `scale(${1 / this.core.viewport.scale})`;
                this.radialBtns.forEach(b => b.classList.remove('active'));
            }, 400);
            
            const onMove = (em) => {
                const pdx = em.clientX - startClientX;
                const pdy = em.clientY - startClientY;
                
                if (!this.isRadialOpen) {
                    if (Math.abs(pdx) > 5 || Math.abs(pdy) > 5) {
                        clearTimeout(this.radialTimer);
                    }
                    if (this.isDragging) {
                        const currentPos = this.core.viewport.getCanvasPos(em.clientX, em.clientY);
                        const dx = Math.round(currentPos.x - startPos.x);
                        const dy = Math.round(currentPos.y - startPos.y);
                        
                        this.transformMatrix = new DOMMatrix().translate(dx, dy).multiply(this.baseMatrix);
                        
                        this.previewTransform();
                        this.updateDragHandle();
                    }
                } else {
                    this.activeRadialAction = null; 
                    let minDist = 65; 
                    for (const [action, offset] of Object.entries(this.radialOffsets)) { 
                        const dist = Math.hypot(pdx - offset.dx, pdy - offset.dy); 
                        if (dist < minDist) { 
                            minDist = dist; 
                            this.activeRadialAction = action; 
                        } 
                    }
                    this.radialBtns.forEach(b => { 
                        if (b.getAttribute('data-action') === this.activeRadialAction) {
                            b.classList.add('active'); 
                        } else {
                            b.classList.remove('active'); 
                        }
                    });
                }
            };
            
            const onUp = (eu) => {
                clearTimeout(this.radialTimer); 
                this.dragHandle.releasePointerCapture(eu.pointerId); 
                this.dragHandle.removeEventListener('pointermove', onMove); 
                this.dragHandle.removeEventListener('pointerup', onUp);
                
                if (this.isRadialOpen) {
                    this.radialMenu.style.display = 'none'; 
                    this.isRadialOpen = false;
                    
                    if (this.activeRadialAction) {
                        if (this.activeRadialAction === 'copy') this.radialCopy(); 
                        if (this.activeRadialAction === 'cut') this.radialCut(); 
                        if (this.activeRadialAction === 'duplicate') this.radialDuplicate(); 
                        if (this.activeRadialAction === 'paste') this.radialPaste(); 
                        if (this.activeRadialAction === 'fliph') this.radialFlip(CONSTANTS.MIRROR.H); 
                        if (this.activeRadialAction === 'flipv') this.radialFlip(CONSTANTS.MIRROR.V);
                    }
                    this.radialBtns.forEach(b => b.classList.remove('active'));
                } else if (this.isDragging) {
                    this.isDragging = false;
                }
            };
            this.dragHandle.addEventListener('pointermove', onMove); 
            this.dragHandle.addEventListener('pointerup', onUp); 
            this.dragHandle.addEventListener('pointercancel', onUp);
        });
    }
}
