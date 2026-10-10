import { CONSTANTS } from '../core/Constants.js?cb=103';

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
        this.floatOffsetX = 0; 
        this.floatOffsetY = 0;
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
            
            h.style.cssText = `width: ${w}; height: ${hght}; background: rgba(173, 216, 230, 0.4); border: 2px solid rgba(255, 255, 255, 0.8); pointer-events: none; box-shadow: 0 2px 4px rgba(0,0,0,0.6);`;
            
            wrapper.appendChild(h);
            viewport.appendChild(wrapper);
            this.scaleHandles[type] = { wrapper, visual: h };
            this.bindScaleHandle(wrapper, type);
        });

        this.rotIndicator = document.createElement('div');
        this.rotIndicator.style.cssText = `position: absolute; pointer-events: none; z-index: 104; display: none;`;
        this.rotIndicator.innerHTML = `
            <svg width="60" height="60" style="overflow: visible; transform: translate(-50%, -50%);" viewBox="-30 -30 60 60">
                <path d="M 25 0 A 25 25 0 0 1 0 25" fill="none" stroke="white" stroke-width="3" stroke-dasharray="4,4" opacity="0.9"/>
                <path d="M 20 5 L 25 0 L 30 5" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round" opacity="0.9"/>
                <path d="M 5 20 L 0 25 L 5 30" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round" opacity="0.9"/>
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

            if (this.advancedTransformMode && !e.target.closest('#dragHandle') && !e.target.closest('.ui-widget') && !e.target.closest('.header-tools')) {
                if (this.core.state.tool.current !== CONSTANTS.TOOLS.ZOOM) {
                    this.startRotation(e);
                    return;
                }
            }

            const pos = this.core.viewport.getCanvasPos(e.clientX, e.clientY);
            const sb = this.bounds;
            const fX = this.floatOffsetX;
            const fY = this.floatOffsetY;
            
            const inBounds = pos.x >= sb.minX + fX && pos.x <= sb.maxX + fX && 
                             pos.y >= sb.minY + fY && pos.y <= sb.maxY + fY;
            
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
        this.floatOffsetX = 0; 
        this.floatOffsetY = 0; 
        this.isUniformScaling = false;
        this.advancedTransformMode = false;
        this.selectionMode = CONSTANTS.SELECT_MODE.REPLACE;
        if (this.selectionModifierUI) this.selectionModifierUI.style.display = 'none';
        this.rebuildPath();
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
                    
                    if (y === 0 || !this.mask[(y-1)*w + x]) { this.path.moveTo(x, y); this.path.lineTo(x+1, y); }
                    if (y === h-1 || !this.mask[(y+1)*w + x]) { this.path.moveTo(x, y+1); this.path.lineTo(x+1, y+1); }
                    if (x === 0 || !this.mask[y*w + (x-1)]) { this.path.moveTo(x, y); this.path.lineTo(x, y+1); }
                    if (x === w-1 || !this.mask[y*w + (x+1)]) { this.path.moveTo(x+1, y); this.path.lineTo(x+1, y+1); }
                }
            }
        }
        this.isActive = hasSelection; 
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
        } else {
            this.burnFloatOffset();
        }
        
        this.isRotating = true;
        
        const dragHandleRect = this.dragHandle.getBoundingClientRect();
        this.rotOriginX = dragHandleRect.left + dragHandleRect.width / 2;
        this.rotOriginY = dragHandleRect.top + dragHandleRect.height / 2;
        
        this.startRotAngle = Math.atan2(e.clientY - this.rotOriginY, e.clientX - this.rotOriginX);
        
        const bw = this.bounds.maxX - this.bounds.minX + 1;
        const bh = this.bounds.maxY - this.bounds.minY + 1;
        
        this.rotOrigBounds = {
            minX: this.bounds.minX,
            minY: this.bounds.minY,
            maxX: this.bounds.maxX,
            maxY: this.bounds.maxY
        };
        
        this.rotOrigCanvas = document.createElement('canvas');
        this.rotOrigCanvas.width = bw;
        this.rotOrigCanvas.height = bh;
        this.rotOrigCanvas.getContext('2d').drawImage(
            this.floatingCanvas,
            this.bounds.minX, this.bounds.minY, bw, bh,
            0, 0, bw, bh
        );
        
        this.rotOrigMask = new Uint8Array(bw * bh);
        const w = this.core.bgCanvas.width;
        for(let y=0; y<bh; y++) {
            for(let x=0; x<bw; x++) {
                if(this.mask[(this.bounds.minY + y) * w + (this.bounds.minX + x)]) {
                    this.rotOrigMask[y * bw + x] = 1;
                }
            }
        }
        
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
        this.applyRotation(this.rotOrigCanvas, this.rotOrigMask, diff);
    }
    
    onRotateUp(e) {
        this.isRotating = false;
        document.body.removeEventListener('pointermove', this.onRotateMoveBound);
        document.body.removeEventListener('pointerup', this.onRotateUpBound);
        document.body.removeEventListener('pointercancel', this.onRotateUpBound);
    }
    
    applyRotation(origCanvas, origMask, angleDiff) {
        const origW = origCanvas.width;
        const origH = origCanvas.height;
        
        const absCos = Math.abs(Math.cos(angleDiff));
        const absSin = Math.abs(Math.sin(angleDiff));
        const targetW = Math.ceil(origW * absCos + origH * absSin);
        const targetH = Math.ceil(origW * absSin + origH * absCos);
        
        const cx = origW / 2;
        const cy = origH / 2;
        const ncx = targetW / 2;
        const ncy = targetH / 2;
        
        const rotCanvas = document.createElement('canvas');
        rotCanvas.width = targetW;
        rotCanvas.height = targetH;
        const ctx = rotCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.translate(ncx, ncy);
        ctx.rotate(angleDiff);
        ctx.translate(-cx, -cy);
        ctx.drawImage(origCanvas, 0, 0);
        
        const w = this.core.bgCanvas.width;
        const h = this.core.bgCanvas.height;
        
        const fCtx = this.floatingCanvas.getContext('2d', { willReadFrequently: true });
        fCtx.clearRect(0, 0, w, h);
        fCtx.imageSmoothingEnabled = false;
        
        const bCx = this.rotOrigBounds.minX + origW / 2;
        const bCy = this.rotOrigBounds.minY + origH / 2;
        
        const newMinX = Math.round(bCx - ncx);
        const newMinY = Math.round(bCy - ncy);
        
        fCtx.drawImage(rotCanvas, newMinX, newMinY);
        
        this.mask.fill(0);
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = origW;
        maskCanvas.height = origH;
        const mCtx = maskCanvas.getContext('2d');
        const mData = mCtx.createImageData(origW, origH);
        for (let i=0; i<origMask.length; i++) {
            if (origMask[i]) {
                mData.data[i*4] = 255;
                mData.data[i*4+3] = 255;
            }
        }
        mCtx.putImageData(mData, 0, 0);
        
        const rmCanvas = document.createElement('canvas');
        rmCanvas.width = targetW;
        rmCanvas.height = targetH;
        const rmCtx = rmCanvas.getContext('2d');
        rmCtx.imageSmoothingEnabled = false;
        rmCtx.translate(ncx, ncy);
        rmCtx.rotate(angleDiff);
        rmCtx.translate(-cx, -cy);
        rmCtx.drawImage(maskCanvas, 0, 0);
        
        const rmData = rmCtx.getImageData(0, 0, targetW, targetH).data;
        for (let y=0; y<targetH; y++) {
            for (let x=0; x<targetW; x++) {
                if (rmData[(y*targetW + x)*4 + 3] > 128) {
                    const absX = newMinX + x;
                    const absY = newMinY + y;
                    if (absX >= 0 && absX < w && absY >= 0 && absY < h) {
                        this.mask[absY * w + absX] = 1;
                    }
                }
            }
        }
        
        this.floatOffsetX = 0;
        this.floatOffsetY = 0;
        this.rebuildPath();
    }

    updateDragHandle() {
        if (!this.isActive || this.core.state.isSpriteSheetView) { 
            this.dragHandle.style.display = 'none'; 
            this.radialMenu.style.display = 'none'; 
            if (this.rotIndicator) this.rotIndicator.style.display = 'none';
            for (let t in this.scaleHandles) this.scaleHandles[t].wrapper.style.display = 'none';
            return; 
        }
        this.dragHandle.style.display = 'flex';
        const canvasCx = this.bounds.minX + (this.bounds.maxX - this.bounds.minX) / 2 + 0.5;
        const canvasCy = this.bounds.minY + (this.bounds.maxY - this.bounds.minY) / 2 + 0.5;
        const metrics = this.core.viewport.getMetrics();
        const cssX = metrics.offsetX + ((canvasCx + this.floatOffsetX) * metrics.scaleX);
        const cssY = metrics.offsetY + ((canvasCy + this.floatOffsetY) * metrics.scaleY);
        
        this.dragHandle.style.left = cssX + 'px'; 
        this.dragHandle.style.top = cssY + 'px'; 
        this.dragHandle.style.transform = `translate(-50%, -50%) scale(${1 / this.core.viewport.scale})`;
        
        const minX = this.bounds.minX + this.floatOffsetX;
        const minY = this.bounds.minY + this.floatOffsetY;
        const maxX = this.bounds.maxX + this.floatOffsetX + 1; 
        const maxY = this.bounds.maxY + this.floatOffsetY + 1;

        const getCssPos = (cx, cy) => ({
            x: metrics.offsetX + (cx * metrics.scaleX),
            y: metrics.offsetY + (cy * metrics.scaleY)
        });

        const posMap = {
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
                obj.wrapper.style.transform = `translate(-50%, -50%) scale(${1 / this.core.viewport.scale})`;
                obj.visual.style.backgroundColor = this.isUniformScaling ? 'rgba(255, 215, 0, 0.4)' : 'rgba(173, 216, 230, 0.4)';
            } else {
                obj.wrapper.style.display = 'none';
            }
        }
        
        if (this.advancedTransformMode) {
            this.rotIndicator.style.display = 'block';
            this.rotIndicator.style.left = cssX + 'px';
            this.rotIndicator.style.top = cssY + 'px';
            this.rotIndicator.style.transform = `scale(${1 / this.core.viewport.scale})`;
        } else {
            this.rotIndicator.style.display = 'none';
        }
    }
    shiftMask(dx, dy) {
        const w = this.core.bgCanvas.width;
        const h = this.core.bgCanvas.height;
        const newMask = new Uint8Array(w * h);
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                if (this.mask[y*w + x]) { 
                    const nx = x + dx;
                    const ny = y + dy; 
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        newMask[ny*w + nx] = 1; 
                    }
                }
            }
        }
        this.mask = newMask; 
        this.rebuildPath();
    }
    burnFloatOffset() {
        if (this.floatOffsetX === 0 && this.floatOffsetY === 0) return;
        const fCtx = this.floatingCanvas.getContext('2d', { willReadFrequently: true });
        const temp = document.createElement('canvas');
        temp.width = this.floatingCanvas.width; 
        temp.height = this.floatingCanvas.height; 
        temp.getContext('2d').drawImage(this.floatingCanvas, 0, 0);
        
        fCtx.clearRect(0, 0, this.floatingCanvas.width, this.floatingCanvas.height); 
        fCtx.drawImage(temp, this.floatOffsetX, this.floatOffsetY);
        
        this.shiftMask(this.floatOffsetX, this.floatOffsetY); 
        this.floatOffsetX = 0; 
        this.floatOffsetY = 0; 
        this.floatingCanvas.style.transform = 'translate(0px, 0px)';
    }
    floatSelection() {
        if (this.isFloating || !this.core.doc) return;
        this.isFloating = true; 
        const w = this.core.doc.width;
        const h = this.core.doc.height;
        
        this.floatingCanvas.width = w; 
        this.floatingCanvas.height = h; 
        this.floatingCanvas.style.display = 'block'; 
        this.floatingCanvas.style.transform = `translate(0px, 0px)`;
        
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
        this.core.doc.activeCtx.putImageData(aData, 0, 0); 
        this.core.doc.activeLayer.markModified();
        
        if(this.core.renderer) this.core.renderer.render(); 
        this.core.playback.updateOnionSkin(); 
        this.core.saveState();
    }
    radialCopy() {
        if (!this.isFloating) return; 
        const clipC = document.createElement('canvas'); 
        clipC.width = this.floatingCanvas.width; 
        clipC.height = this.floatingCanvas.height;
        clipC.getContext('2d').drawImage(this.floatingCanvas, this.floatOffsetX, this.floatOffsetY);
        
        this.clipboard = {
            canvas: clipC,
            mask: (() => {
                const w = this.core.bgCanvas.width;
                const h = this.core.bgCanvas.height;
                const nm = new Uint8Array(w * h);
                for(let y=0; y<h; y++) { 
                    for(let x=0; x<w; x++) { 
                        if(this.mask[y*w+x]){ 
                            let nx = x + this.floatOffsetX;
                            let ny = y + this.floatOffsetY; 
                            if(nx >= 0 && nx < w && ny >= 0 && ny < h) nm[ny*w+nx] = 1; 
                        } 
                    } 
                } 
                return nm;
            })(),
            bounds: { 
                minX: this.bounds.minX + this.floatOffsetX, 
                maxX: this.bounds.maxX + this.floatOffsetX, 
                minY: this.bounds.minY + this.floatOffsetY, 
                maxY: this.bounds.maxY + this.floatOffsetY 
            }
        };
    }
    radialDuplicate() {
        if (!this.core.doc) return;
        this.radialCopy(); 
        this.burnFloatOffset(); 
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
        this.floatingCanvas.style.transform = 'translate(0px, 0px)';
        
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
        this.floatOffsetX = 0; 
        this.floatOffsetY = 0; 
        this.rebuildPath();
    }
    radialCut() {
        if (!this.isFloating) return;
        this.radialCopy(); 
        this.floatingCanvas.getContext('2d').clearRect(0, 0, this.floatingCanvas.width, this.floatingCanvas.height);
        this.floatingCanvas.style.display = 'none'; 
        this.isFloating = false; 
        if (this.mask) this.mask.fill(0);
        this.isActive = false; 
        this.floatOffsetX = 0; 
        this.floatOffsetY = 0; 
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
            
            if (this.isDragging && !this.isRadialOpen) {
                ctx.translate(this.floatOffsetX, this.floatOffsetY);
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
    bindScaleHandle(h, type) {
        let startClientX, startClientY;
        let startBounds;
        let scaleOrigCanvas = null;
        let scaleOrigMask = null;

        h.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (!this.core.doc) return;

            if (!this.isFloating) {
                this.floatSelection();
            } else {
                this.burnFloatOffset();
            }

            this.isScaling = true;
            this.isUniformScaling = false;
            h.setPointerCapture(e.pointerId);

            startClientX = e.clientX;
            startClientY = e.clientY;

            startBounds = {
                minX: this.bounds.minX,
                minY: this.bounds.minY,
                maxX: this.bounds.maxX,
                maxY: this.bounds.maxY
            };

            const bw = startBounds.maxX - startBounds.minX + 1;
            const bh = startBounds.maxY - startBounds.minY + 1;

            scaleOrigCanvas = document.createElement('canvas');
            scaleOrigCanvas.width = bw;
            scaleOrigCanvas.height = bh;
            scaleOrigCanvas.getContext('2d').drawImage(
                this.floatingCanvas,
                startBounds.minX, startBounds.minY, bw, bh,
                0, 0, bw, bh
            );

            scaleOrigMask = new Uint8Array(bw * bh);
            const w = this.core.bgCanvas.width;
            for(let y=0; y<bh; y++) {
                for(let x=0; x<bw; x++) {
                    if(this.mask[(startBounds.minY + y) * w + (startBounds.minX + x)]) {
                        scaleOrigMask[y * bw + x] = 1;
                    }
                }
            }

            this.scaleTimer = setTimeout(() => {
                this.isUniformScaling = true;
                for (let t in this.scaleHandles) {
                    this.scaleHandles[t].style.backgroundColor = '#FFD700';
                }
            }, 500);

            const onMove = (em) => {
                if (Math.abs(em.clientX - startClientX) > 4 || Math.abs(em.clientY - startClientY) > 4) {
                    clearTimeout(this.scaleTimer);
                }

                const dxScreen = em.clientX - startClientX;
                const dyScreen = em.clientY - startClientY;
                const metrics = this.core.viewport.getMetrics();

                const dxCanvas = dxScreen / metrics.scaleX / this.core.viewport.scale;
                const dyCanvas = dyScreen / metrics.scaleY / this.core.viewport.scale;

                let newMinX = startBounds.minX;
                let newMinY = startBounds.minY;
                let newMaxX = startBounds.maxX + 1;
                let newMaxY = startBounds.maxY + 1;

                if (this.isUniformScaling) {
                    const aspect = bw / bh;
                    let scaleDelta = 0;
                    
                    if (type.includes('e')) scaleDelta = dxCanvas;
                    else if (type.includes('w')) scaleDelta = -dxCanvas;
                    else if (type.includes('s')) scaleDelta = dyCanvas * aspect;
                    else if (type.includes('n')) scaleDelta = -dyCanvas * aspect;
                    else scaleDelta = dxCanvas;
                    
                    newMinX -= scaleDelta;
                    newMaxX += scaleDelta;
                    newMinY -= scaleDelta / aspect;
                    newMaxY += scaleDelta / aspect;
                } else {
                    if (type.includes('w')) newMinX += dxCanvas;
                    if (type.includes('e')) newMaxX += dxCanvas;
                    if (type.includes('n')) newMinY += dyCanvas;
                    if (type.includes('s')) newMaxY += dyCanvas;
                }

                if (newMaxX < newMinX + 1) { const t = newMaxX; newMaxX = newMinX + 1; newMinX = t - 1; }
                if (newMaxY < newMinY + 1) { const t = newMaxY; newMaxY = newMinY + 1; newMinY = t - 1; }

                this.applyScale(scaleOrigCanvas, scaleOrigMask, bw, bh, newMinX, newMinY, newMaxX, newMaxY);
            };

            const onUp = (eu) => {
                clearTimeout(this.scaleTimer);
                h.releasePointerCapture(eu.pointerId);
                h.removeEventListener('pointermove', onMove);
                h.removeEventListener('pointerup', onUp);
                h.removeEventListener('pointercancel', onUp);
                this.isScaling = false;
            };

            h.addEventListener('pointermove', onMove);
            h.addEventListener('pointerup', onUp);
            h.addEventListener('pointercancel', onUp);
        });
    }
    applyScale(origCanvas, origMask, origW, origH, minX, minY, maxX, maxY) {
        const targetW = Math.max(1, Math.round(maxX - minX));
        const targetH = Math.max(1, Math.round(maxY - minY));
        const roundMinX = Math.round(minX);
        const roundMinY = Math.round(minY);

        const w = this.core.bgCanvas.width;
        const h = this.core.bgCanvas.height;

        const fCtx = this.floatingCanvas.getContext('2d', { willReadFrequently: true });
        fCtx.clearRect(0, 0, w, h);
        fCtx.imageSmoothingEnabled = false;

        fCtx.drawImage(origCanvas, 0, 0, origW, origH, roundMinX, roundMinY, targetW, targetH);

        this.mask.fill(0);
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = origW;
        maskCanvas.height = origH;
        const mCtx = maskCanvas.getContext('2d');
        const mData = mCtx.createImageData(origW, origH);
        for (let i=0; i<origMask.length; i++) {
            if (origMask[i]) {
                mData.data[i*4] = 255;
                mData.data[i*4+3] = 255;
            }
        }
        mCtx.putImageData(mData, 0, 0);

        const scaledMaskCanvas = document.createElement('canvas');
        scaledMaskCanvas.width = targetW;
        scaledMaskCanvas.height = targetH;
        const smCtx = scaledMaskCanvas.getContext('2d');
        smCtx.imageSmoothingEnabled = false;
        smCtx.drawImage(maskCanvas, 0, 0, origW, origH, 0, 0, targetW, targetH);
        const smData = smCtx.getImageData(0, 0, targetW, targetH).data;

        for (let y=0; y<targetH; y++) {
            for (let x=0; x<targetW; x++) {
                if (smData[(y*targetW + x)*4 + 3] > 128) {
                    const absX = roundMinX + x;
                    const absY = roundMinY + y;
                    if (absX >= 0 && absX < w && absY >= 0 && absY < h) {
                        this.mask[absY * w + absX] = 1;
                    }
                }
            }
        }

        this.floatOffsetX = 0;
        this.floatOffsetY = 0;
        this.rebuildPath();
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
            const startFloatX = this.floatOffsetX;
            const startFloatY = this.floatOffsetY;
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
                        this.floatOffsetX = startFloatX + Math.round(currentPos.x - startPos.x); 
                        this.floatOffsetY = startFloatY + Math.round(currentPos.y - startPos.y);
                        const metrics = this.core.viewport.getMetrics(); 
                        this.floatingCanvas.style.transform = `translate(${this.floatOffsetX * metrics.scaleX}px, ${this.floatOffsetY * metrics.scaleY}px)`;
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
                    if (this.floatOffsetX !== 0 || this.floatOffsetY !== 0) {
                        const fCtx = this.floatingCanvas.getContext('2d', { willReadFrequently: true });
                        const temp = document.createElement('canvas'); 
                        temp.width = this.floatingCanvas.width; 
                        temp.height = this.floatingCanvas.height;
                        temp.getContext('2d').drawImage(this.floatingCanvas, 0, 0); 
                        
                        fCtx.clearRect(0, 0, this.floatingCanvas.width, this.floatingCanvas.height); 
                        fCtx.drawImage(temp, this.floatOffsetX, this.floatOffsetY);
                        
                        const droppedOffsetX = this.floatOffsetX;
                        const droppedOffsetY = this.floatOffsetY; 
                        this.floatOffsetX = 0; 
                        this.floatOffsetY = 0; 
                        this.floatingCanvas.style.transform = 'translate(0px, 0px)'; 
                        this.shiftMask(droppedOffsetX, droppedOffsetY);
                    }
                }
            };
            this.dragHandle.addEventListener('pointermove', onMove); 
            this.dragHandle.addEventListener('pointerup', onUp); 
            this.dragHandle.addEventListener('pointercancel', onUp);
        });
    }
}
