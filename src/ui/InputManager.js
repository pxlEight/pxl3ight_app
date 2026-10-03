import { CONSTANTS } from '../core/Constants.js';

export default class InputManager {
    constructor(containerElement, core) {
        this.container = containerElement; 
        this.core = core;
        this.activePointers = new Map();
        this.isPanning = false; 
        this.lastPinchDistance = 0; 
        this.lastCenterX = 0; 
        this.lastCenterY = 0;
        this.pointerDownX = 0; 
        this.pointerDownY = 0;
        
        this.bindEvents();
    }
    
    updateCrosshairPosition(clientX, clientY) {
        this.core.events.emit('ui:moveCrosshair', { x: clientX, y: clientY - 60 });
        
        const pos = this.core.viewport.getCanvasPos(clientX, clientY - 60);
        
        if (!this.core.doc && !this.core.state.isSpriteSheetView) return;
        
        const canvas = this.core.state.isSpriteSheetView ? this.core.spriteSheetViewCanvas : this.core.doc.activeLayer.canvas;
        const ctx = this.core.state.isSpriteSheetView ? this.core.spriteSheetCtx : this.core.doc.activeCtx;
        
        if (pos.x >= 0 && pos.x < canvas.width && pos.y >= 0 && pos.y < canvas.height) {
            const pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data;
            if (pixel[3] > 0) {
                const hex = "#" + (1 << 24 | pixel[0] << 16 | pixel[1] << 8 | pixel[2]).toString(16).slice(1).toUpperCase();
                this.core.events.emit('ui:previewCrosshairColor', hex);
            }
        }
    }
    
    onPointerDown(e) {
        if(e.target.id === 'dragHandle' || e.target.closest('.scale-handle') || e.target.closest('.corner-btn') || e.target.closest('#radialMenu') || e.target.closest('header')) return;
        if (e.target.closest('.widget') || e.target.closest('.bottom-widget') || e.target.closest('.context-menu') || e.target.closest('.shape-menu')) return; 

        const pos = this.core.viewport.getCanvasPos(e.clientX, e.clientY);

        if (this.core.selection.isActive) {
            const sb = this.core.selection.bounds;
            const fX = this.core.selection.floatOffsetX;
            const fY = this.core.selection.floatOffsetY;
            
            const inBounds = pos.x >= sb.minX + fX && pos.x <= sb.maxX + fX && 
                             pos.y >= sb.minY + fY && pos.y <= sb.maxY + fY;
            
            if (!inBounds) {
                const targetTag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
                const isCanvasArea = targetTag === 'canvas' || e.target.id === 'viewport' || e.target.id === 'mainContainer';
                if (isCanvasArea) {
                    if (this.core.state.tool.current !== CONSTANTS.TOOLS.ZOOM) {
                        if (this.core.selection.isUniformScaling) {
                            this.core.selection.isUniformScaling = false;
                            this.core.selection.updateDragHandle();
                            return; 
                        }
                    }
                }
            }
        }

        if (!this.core.doc) return; 
        
        const currentLayer = this.core.doc.activeLayer; 
        if (!currentLayer.visible || currentLayer.locked) return;
        
        this.activePointers.set(e.pointerId, e);
        
        if (this.activePointers.size === 1) {
            if (this.core.selection && this.core.selection.advancedTransformMode && this.core.state.tool.current !== CONSTANTS.TOOLS.ZOOM) {
                return;
            }
            
            if (this.core.state.tool.current !== CONSTANTS.TOOLS.ZOOM) {
                this.core.selection.anchor(); 
            }
            this.pointerDownX = e.clientX; 
            this.pointerDownY = e.clientY; 
            
            this.core.events.emit('ui:closeAllMenus'); 
            this.core.events.emit('ui:hidePalettePanel');
            
            if (this.core.tools.activeTool) {
                this.core.tools.activeTool.onPointerDown(pos, e);
            }
        } else if (this.activePointers.size === 2) {
            if (this.core.selection && this.core.selection.advancedTransformMode && this.core.state.tool.current !== CONSTANTS.TOOLS.ZOOM) {
                return;
            }

            if (this.core.tools.activeTool && this.core.tools.activeTool.cancel) {
                this.core.tools.activeTool.cancel();
            }
            if (this.core.state.input.crosshairTimer) { 
                clearTimeout(this.core.state.input.crosshairTimer); 
                this.core.state.input.crosshairTimer = null; 
            }
            
            this.isPanning = true; 
            const touches = Array.from(this.activePointers.values());
            this.lastPinchDistance = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
            this.lastCenterX = (touches[0].clientX + touches[1].clientX) / 2; 
            this.lastCenterY = (touches[0].clientY + touches[1].clientY) / 2;
        }
        this.container.setPointerCapture(e.pointerId);
    }
    
    onPointerMove(e) {
        if (!this.activePointers.has(e.pointerId)) return; 
        this.activePointers.set(e.pointerId, e);
        
        const pos = this.core.viewport.getCanvasPos(e.clientX, e.clientY);
        
        if (this.core.state.input.crosshairTimer && (Math.abs(e.clientX - this.pointerDownX) > 10 || Math.abs(e.clientY - this.pointerDownY) > 10)) {
            clearTimeout(this.core.state.input.crosshairTimer); 
            this.core.state.input.crosshairTimer = null;
        }
        
        if (this.core.state.input.isCrosshairSampling) { 
            this.updateCrosshairPosition(e.clientX, e.clientY); 
            return; 
        }
        
        if (this.activePointers.size === 1) {
            if (this.core.tools.activeTool) {
                this.core.tools.activeTool.onPointerMove(pos, e);
            }
        } else if (this.isPanning && this.activePointers.size === 2) {
            const touches = Array.from(this.activePointers.values());
            const pinchData = this.core.viewport.handlePinchZoom(touches, this.lastPinchDistance, this.lastCenterX, this.lastCenterY);
            this.lastPinchDistance = pinchData.distance; 
            this.lastCenterX = pinchData.centerX; 
            this.lastCenterY = pinchData.centerY;
        }
    }
    
    onPointerUp(e) {
        this.activePointers.delete(e.pointerId);
        
        if (this.activePointers.size === 0) {
            if (this.core.state.input.crosshairTimer) { 
                clearTimeout(this.core.state.input.crosshairTimer); 
                this.core.state.input.crosshairTimer = null; 
            }
            if (this.core.state.input.isCrosshairSampling) {
                this.core.state.input.isCrosshairSampling = false; 
                this.core.events.emit('ui:hideCrosshair');
                
                if (this.core.state.input.lastCrosshairHex) {
                    this.core.events.emit('core:setHSVColor', this.core.state.input.lastCrosshairHex);
                    
                    if (this.core.state.tool.current === CONSTANTS.TOOLS.COLOR_SELECT && this.core.tools.activeTool) {
                        this.core.tools.activeTool.doColorSelectHex(this.core.state.input.lastCrosshairHex, this.core.tools.activeTool.activeMode);
                    }
                }
                
                if (this.core.state.tool.current === CONSTANTS.TOOLS.DROPPER) {
                    this.core.events.emit('requestToolChange', CONSTANTS.TOOLS.PENCIL);
                }
                
                if (this.core.tools.activeTool && this.core.tools.activeTool.cancel) {
                    this.core.tools.activeTool.cancel();
                }
                return;
            }
            
            const pos = this.core.viewport.getCanvasPos(e.clientX, e.clientY);
            if (this.core.tools.activeTool) {
                this.core.tools.activeTool.onPointerUp(pos, e);
            }
            
            this.isPanning = false; 
            this.lastPinchDistance = 0;
        } else if (this.activePointers.size === 1) { 
            this.isPanning = false; 
            this.lastPinchDistance = 0; 
        }
    }
    
    bindEvents() {
        this.container.addEventListener('pointerdown', this.onPointerDown.bind(this)); 
        this.container.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this)); 
        window.addEventListener('pointercancel', this.onPointerUp.bind(this));
        this.container.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        
        this.core.events.on('tool:startCrosshairTimer', ({ e, requireLongPress }) => {
            this.core.state.input.crosshairTimer = setTimeout(() => {
                this.core.state.input.isCrosshairSampling = true; 
                
                if (this.core.state.tool.current !== CONSTANTS.TOOLS.DROPPER && this.core.state.tool.current !== CONSTANTS.TOOLS.FILL) {
                    if (this.core.tools.activeTool && this.core.tools.activeTool.cancel) {
                        this.core.tools.activeTool.cancel();
                    }
                } 
                
                this.core.events.emit('ui:showCrosshair');
                this.updateCrosshairPosition(e.clientX, e.clientY);
            }, requireLongPress ? 400 : 0);
        });
    }
}
