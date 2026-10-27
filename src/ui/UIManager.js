import { CONSTANTS, CANVAS_PERF } from '../core/Constants.js?cb=171';
import UIWidgetDragger from './UIWidgetDragger.js?cb=171';
import UIDragInteraction from './UIDragInteraction.js?cb=171';
import PaletteManager from './PaletteManager.js?cb=171';

export default class UIManager {
    constructor(core) {
        this.core = core; 
        this.events = core.events;
        this.contextMenuFrameIndex = -1;
        this._lastActiveFrameIndex = -1;
        this._timelineStrip = null;
        this._frameNumberRow = null;
        
        this.bindGlobalEvents();
        this.initPalettes();
        this.bindExtraUI();
        
        this.events.on('ui:updateTool', (tool) => this.setTool(tool));
        // Several events fire back-to-back for a single user action (e.g. switchFrame emits both
        // frameChanged and layerChanged). Coalesce them into a single refresh per task.
        this._uiRefreshQueued = false;
        this._scheduleUIRefresh = () => {
            if (this.core.playback && this.core.playback.isPlaying) {
                this.updateActiveFrameOnly();
                return;
            }
            if (this._uiRefreshQueued) return;
            this._uiRefreshQueued = true;
            queueMicrotask(() => {
                this._uiRefreshQueued = false;
                this.updateLayerStackUI();
                this.updateTimelineUI();
                if (this.core.doc && typeof this.core.doc.virtualizeFrames === 'function') {
                    this.core.doc.virtualizeFrames(this.core.playback?.onionFramesBefore ?? 2, this.core.playback?.onionFramesAfter ?? 2);
                }
            });
        };
        this.events.on('ui:layerChanged', () => this._scheduleUIRefresh());
        this.events.on('ui:frameChanged', () => this._scheduleUIRefresh());
        this.events.on('ui:updateActiveThumbnail', () => this.updateActiveThumbnailOnly());
        this.events.on('ui:closeAllMenus', () => this.closeAllMenus());
        
        this.events.on('core:setHSVColor', (hx) => {
            document.getElementById('currentColorDisplay').style.backgroundColor = hx;
            document.getElementById('customColorProxy').style.backgroundColor = hx;
            this.syncHSVFromHex(hx);
        });
        
        this.events.on('ui:moveCrosshair', (pos) => {
            const el = document.getElementById('colorCrosshair');
            el.style.left = pos.x + 'px';
            el.style.top = pos.y + 'px';
        });
        
        this.events.on('ui:previewCrosshairColor', (hex) => {
            document.getElementById('crosshairPreview').style.backgroundColor = hex;
            document.getElementById('currentColorDisplay').style.backgroundColor = hex;
            this.core.state.input.lastCrosshairHex = hex;
        });
        
        this.events.on('ui:hideCrosshair', () => { document.getElementById('colorCrosshair').style.display = 'none'; });
        this.events.on('ui:showCrosshair', () => { document.getElementById('colorCrosshair').style.display = 'flex'; });
        
        this.events.on('ui:togglePalettePanel', () => {
            const panel = document.getElementById('palettePanel');
            const isOpening = (panel.style.display === 'none' || panel.style.display === '');
            if (isOpening) {
                const widget = panel.closest('.widget');
                if (widget) {
                    const rect = widget.getBoundingClientRect();
                    if (rect.left < window.innerWidth / 2) {
                        panel.style.left = '100%';
                        panel.style.right = 'auto';
                        panel.style.marginLeft = '10px';
                        panel.style.marginRight = '0';
                    } else {
                        panel.style.right = '100%';
                        panel.style.left = 'auto';
                        panel.style.marginRight = '10px';
                        panel.style.marginLeft = '0';
                    }
                    
                    panel.style.top = '0px';
                    panel.style.bottom = 'auto';
                    panel.style.display = 'block';
                    const panelRect = panel.getBoundingClientRect();
                    if (panelRect.bottom > window.innerHeight - 10) {
                        const overflow = panelRect.bottom - (window.innerHeight - 10);
                        panel.style.top = `-${overflow}px`;
                    }
                }
            } else {
                panel.style.display = 'none';
            }
        });
        
        this.events.on('ui:toggleBrushPanel', () => {
            const panel = document.getElementById('brushPanel');
            const isOpening = (panel.style.display === 'none' || panel.style.display === '');
            if (isOpening) {
                const widget = panel.closest('.widget');
                if (widget) {
                    const rect = widget.getBoundingClientRect();
                    if (rect.left < window.innerWidth / 2) {
                        panel.style.left = '100%';
                        panel.style.right = 'auto';
                        panel.style.marginLeft = '10px';
                        panel.style.marginRight = '0';
                    } else {
                        panel.style.right = '100%';
                        panel.style.left = 'auto';
                        panel.style.marginRight = '10px';
                        panel.style.marginLeft = '0';
                    }

                    panel.style.top = '0px';
                    panel.style.bottom = 'auto';
                    panel.style.display = 'block';
                    const panelRect = panel.getBoundingClientRect();
                    if (panelRect.bottom > window.innerHeight - 10) {
                        const overflow = panelRect.bottom - (window.innerHeight - 10);
                        panel.style.top = `-${overflow}px`;
                    }
                }
            } else {
                panel.style.display = 'none';
            }
        });
        
        this.events.on('ui:hidePalettePanel', () => { document.getElementById('palettePanel').style.display = 'none'; });
        this.events.on('ui:hideStartupScreen', () => { 
            document.getElementById('startupScreen').style.display = 'none'; 
            this.hideAllStartupSubmenus();
            const sm = document.getElementById('startupMenu');
            if (sm) sm.style.display = 'flex';
        });
        this.events.on('ui:resetFileInput', () => { 
            document.getElementById('fileInput').value = ''; 
            document.getElementById('projectFileInput').value = ''; 
        });
        this.events.on('ui:clearCustomColors', () => { document.getElementById('customGrid').innerHTML = ''; });
        
        this.events.on('ui:playbackChanged', (isPlaying) => {
            const playBtn = document.getElementById('btn-play');
            if (isPlaying) { 
                playBtn.classList.add('active'); 
                playBtn.innerText = '⏸️'; 
                document.body.classList.add('is-playing');
            } else { 
                playBtn.classList.remove('active'); 
                playBtn.innerText = '▶️'; 
                document.body.classList.remove('is-playing');
            }
        });
        
        this.events.on('ui:onionSkinToggled', (isEnabled) => {
            const btn = document.getElementById('onionToggleBtn'); 
            btn.innerText = '🧅'; 
            btn.classList.toggle('active', isEnabled);
            btn.style.opacity = isEnabled ? '1' : '0.5';
        });
        
        this.events.on('ui:toggleSpriteSheet', (isActive) => this.toggleSpriteSheetUI(isActive));
        
        this.events.on('ui:toggleMirror', (mode) => {
            ['btn-mirror-h', 'btn-mirror-v', 'btn-mirror-q'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active');
            });
            const mainMenuBtn = document.getElementById('btn-mirror-menu');
            const mainIcon = document.getElementById('mirror-main-icon');
            if (mode !== CONSTANTS.MIRROR.NONE) {
                const activeBtn = document.getElementById(`btn-mirror-${mode.toLowerCase()}`);
                if (activeBtn) {
                    activeBtn.classList.add('active');
                    if (mainIcon) {
                        const activeSvg = activeBtn.querySelector('svg');
                        if (activeSvg) mainIcon.innerHTML = activeSvg.innerHTML;
                    }
                }
                if (mainMenuBtn) mainMenuBtn.classList.add('active');
                if (window.appCore) window.appCore.lastMirrorMode = mode; // remember
            } else {
                if (mainMenuBtn) mainMenuBtn.classList.remove('active');
            }
        });

        new UIWidgetDragger('widget-layers', 'handle-layers'); 
        new UIWidgetDragger('widget-tools', 'handle-tools'); 
        new UIWidgetDragger('widget-brush', 'handle-brush'); 
        new UIWidgetDragger('widget-color', 'handle-color');
        
        const timelineHandle = document.querySelector('#widget-timeline .widget-handle');
        if (timelineHandle) {
            this.timelineLevel = parseInt(localStorage.getItem('timelineLevel') || '1', 10);
            if (isNaN(this.timelineLevel) || this.timelineLevel < 1 || this.timelineLevel > 3) {
                this.timelineLevel = 1;
            }
            // set initial expansion if not collapsed
            const tw = document.getElementById('widget-timeline');
            if (tw && !tw.classList.contains('collapsed')) {
                // Defer to allow DOM to be ready
                setTimeout(() => this.setTimelineExpansionLevel(this.timelineLevel, true), 10);
            }

            new UIDragInteraction(timelineHandle, {
                stopPropagation: true,
                preventDefaultOnMove: true,
                onDown: (e, inst) => {
                    window.isDraggingTimeline = false;
                    inst.customData.startLevel = this.timelineLevel || 1;
                    inst.customData.currentLevel = this.timelineLevel || 1;
                },
                onDragMove: (e, dx, dy, inst) => {
                    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                        window.isDraggingTimeline = true;
                    }
                    if (window.isDraggingTimeline) {
                        const widget = document.getElementById('widget-timeline');
                        if (widget.classList.contains('collapsed')) {
                            if (dy < -10) {
                                widget.classList.remove('collapsed');
                                document.getElementById('handle-timeline').innerText = 'TIMELINE ▼';
                                inst.startY = e.clientY; // reset origin
                                inst.customData.startLevel = 1;
                                inst.customData.currentLevel = 1;
                                this.setTimelineExpansionLevel(1);
                            }
                        } else {
                            const threshold = 35;
                            let levelDelta = Math.round(-dy / threshold);
                            let newLevel = inst.customData.startLevel + levelDelta;
                            
                            if (newLevel < 1) {
                                if (levelDelta <= -1) {
                                    widget.classList.add('collapsed');
                                    document.getElementById('handle-timeline').innerText = 'TIMELINE ▲';
                                    inst.startY = e.clientY; // reset origin
                                }
                            } else {
                                newLevel = Math.max(1, Math.min(3, newLevel));
                                if (newLevel !== inst.customData.currentLevel) {
                                    inst.customData.currentLevel = newLevel;
                                    this.setTimelineExpansionLevel(newLevel);
                                }
                            }
                        }
                    }
                },
                onDragEnd: (e, inst) => {
                    setTimeout(() => { window.isDraggingTimeline = false; }, 50);
                }
            });
        }
        
        new UIDragInteraction(document.getElementById('opacityVal'), {
            stopPropagation: true, 
            preventDefaultOnMove: true,
            onDown: (e, inst) => { 
                this.core.selection.anchor(); 
                inst.customData.startOpVal = Math.round(this.core.state.tool.opacity * 100); 
            },
            onDragMove: (e, dx, dy, inst) => {
                let newVal = Math.max(1, Math.min(100, inst.customData.startOpVal - Math.round(dy / 1.5)));
                this.core.state.tool.opacity = newVal / 100; 
                document.getElementById('opacityVal').innerText = newVal;
            }
        });
        
        new UIDragInteraction(document.getElementById('smoothVal'), {
            stopPropagation: true, 
            preventDefaultOnMove: true,
            onDown: (e, inst) => { 
                inst.customData.startSmoothVal = this.core.state.tool.smooth || 0; 
            },
            onDragMove: (e, dx, dy, inst) => {
                let newVal = Math.max(0, Math.min(100, inst.customData.startSmoothVal - Math.round(dy / 1.5)));
                this.core.state.tool.smooth = newVal; 
                document.getElementById('smoothVal').innerText = newVal;
            }
        });
        
        new UIDragInteraction(document.getElementById('velocityVal'), {
            stopPropagation: true, 
            preventDefaultOnMove: true,
            onDown: (e, inst) => { 
                inst.customData.startVelocityVal = this.core.state.tool.velocity || 0; 
            },
            onDragMove: (e, dx, dy, inst) => {
                let newVal = Math.max(-100, Math.min(100, inst.customData.startVelocityVal - Math.round(dy / 1.5)));
                this.core.state.tool.velocity = newVal; 
                document.getElementById('velocityVal').innerText = newVal;
            }
        });
        
        new UIDragInteraction(document.getElementById('lm-opacity'), {
            stopPropagation: true, 
            preventDefaultOnMove: true,
            onDown: (e, inst) => { 
                this.core.selection.anchor(); 
                if (!this.core.doc) return; 
                inst.customData.activeLayerIndex = this.core.doc.activeLayerIndex;
                const activeLayer = this.core.doc.activeLayer;
                inst.customData.startOpVal = Math.round((activeLayer ? activeLayer.opacity : 1.0) * 100); 
            },
            onDragMove: (e, dx, dy, inst) => {
                if (!this.core.doc) return;
                let newVal = Math.max(0, Math.min(100, inst.customData.startOpVal - Math.round(dy / 1.5)));
                const targetOpacity = newVal / 100;
                const activeIdx = inst.customData.activeLayerIndex !== undefined ? inst.customData.activeLayerIndex : this.core.doc.activeLayerIndex;
                this.core.doc.frames.forEach(f => {
                    if (f.layers[activeIdx]) {
                        f.layers[activeIdx].opacity = targetOpacity;
                    }
                });
                document.getElementById('lm-opacity').innerText = newVal;
                if (!this.core.state.isSpriteSheetView) { 
                    if (this.core.renderer) this.core.renderer.render(); 
                    this.core.playback.updateOnionSkin(); 
                }
            },
            onDragEnd: () => {
                this.core.saveState();
                this.events.emit('ui:layerChanged');
            }
        });
        new UIDragInteraction(document.getElementById('long-press-timer-val'), {
            stopPropagation: true, 
            preventDefaultOnMove: true,
            onDown: (e, inst) => { 
                inst.customData.startValSec = (window.longPressTimer || 500) / 1000; 
            },
            onDragMove: (e, dx, dy, inst) => {
                const stepPixels = 20;
                const steps = Math.round(-dy / stepPixels);
                let newSec = inst.customData.startValSec + (steps * 0.25);
                newSec = Math.max(0.25, Math.min(3.0, Math.round(newSec * 100) / 100));
                const newMs = Math.round(newSec * 1000);
                window.longPressTimer = newMs; 
                localStorage.setItem('longPressTimer_v3', newSec.toString());
                localStorage.setItem('longPressTimer_v2', newMs);
                document.getElementById('long-press-timer-val').innerText = newSec;
            }
        });
        
        try {
            window.drawOffset = JSON.parse(localStorage.getItem('drawOffset_v1') || '{"x":0, "y":0}');
        } catch (e) {
            window.drawOffset = {x: 0, y: 0};
        }
        const drawOffsetModal = document.getElementById('draw-offset-modal');
        const drawOffsetContainer = document.getElementById('draw-offset-container');
        const drawOffsetDot = document.getElementById('draw-offset-dot');
        const resetDrawOffsetBtn = document.getElementById('btn-reset-draw-offset');
        const closeDrawOffsetBtn = document.getElementById('btn-close-draw-offset');
        
        if (drawOffsetContainer && drawOffsetDot) {
            drawOffsetDot.style.transform = `translate(calc(-50% + ${window.drawOffset.x}px), calc(-50% + ${window.drawOffset.y}px))`;
            
            const dotRadius = 6;
            const updateDotPosition = (e) => {
                const rect = drawOffsetContainer.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                let nx = e.clientX - centerX;
                let ny = e.clientY - centerY;
                
                const maxLimitX = Math.max(0, (rect.width / 2) - dotRadius);
                const maxLimitY = Math.max(0, (rect.height / 2) - dotRadius);
                
                nx = Math.max(-maxLimitX, Math.min(maxLimitX, Math.round(nx)));
                ny = Math.max(-maxLimitY, Math.min(maxLimitY, Math.round(ny)));
                
                window.drawOffset.x = nx;
                window.drawOffset.y = ny;
                localStorage.setItem('drawOffset_v1', JSON.stringify(window.drawOffset));
                drawOffsetDot.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
            };
            
            new UIDragInteraction(drawOffsetContainer, {
                stopPropagation: true,
                preventDefaultOnMove: true,
                onDown: (e, inst) => {
                    if (e.target.closest('#btn-reset-draw-offset') || e.target.closest('#btn-close-draw-offset')) return;
                    updateDotPosition(e);
                },
                onDragMove: (e, dx, dy, inst) => {
                    updateDotPosition(e);
                }
            });
        }
        
        if (resetDrawOffsetBtn && drawOffsetDot) {
            resetDrawOffsetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.drawOffset.x = 0;
                window.drawOffset.y = 0;
                localStorage.setItem('drawOffset_v1', JSON.stringify(window.drawOffset));
                drawOffsetDot.style.transform = `translate(-50%, -50%)`;
            });
        }

        if (closeDrawOffsetBtn && drawOffsetModal) {
            closeDrawOffsetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                drawOffsetModal.style.display = 'none';
            });
        }

        if (drawOffsetModal) {
            drawOffsetModal.addEventListener('pointerdown', (e) => {
                if (e.target === drawOffsetModal) {
                    drawOffsetModal.style.display = 'none';
                }
            });
        }
        
        const subpixelContainer = document.getElementById('subpixel-smoothing-container');
        const subpixelToggleBtn = document.getElementById('btn-toggle-subpixel');
        const subpixelRadioIndicator = document.getElementById('subpixel-radio-indicator');
        const subpixelStatusText = document.getElementById('subpixel-status-text');

        this.updateSubpixelUI = () => {
            const docW = this.core.doc ? this.core.doc.width : (this.core.bgCanvas ? this.core.bgCanvas.width : 0);
            const docH = this.core.doc ? this.core.doc.height : (this.core.bgCanvas ? this.core.bgCanvas.height : 0);
            const isOver720 = Math.max(docW, docH) >= 720;
            if (subpixelContainer) {
                subpixelContainer.style.display = isOver720 ? 'flex' : 'none';
            }
            const isEnabled = isOver720 && !!this.core.state.subpixelSmoothing;
            if (subpixelToggleBtn) {
                if (isEnabled) {
                    subpixelToggleBtn.classList.add('active');
                    subpixelToggleBtn.style.backgroundColor = 'rgba(255,255,255,0.1)';
                    subpixelToggleBtn.style.borderColor = 'var(--accent)';
                    if (subpixelRadioIndicator) subpixelRadioIndicator.style.display = 'block';
                    if (subpixelStatusText) subpixelStatusText.innerText = 'ON';
                } else {
                    subpixelToggleBtn.classList.remove('active');
                    subpixelToggleBtn.style.backgroundColor = 'rgba(255,255,255,0.05)';
                    subpixelToggleBtn.style.borderColor = '#666';
                    if (subpixelRadioIndicator) subpixelRadioIndicator.style.display = 'none';
                    if (subpixelStatusText) subpixelStatusText.innerText = 'OFF';
                }
            }
        };

        this.events.on('resolutionChanged', () => this.updateSubpixelUI());
        this.events.on('subpixelSmoothingChanged', () => this.updateSubpixelUI());
        this.events.on('ui:updateSubpixelUI', () => this.updateSubpixelUI());
        
        // init UI
        if (document.getElementById('long-press-timer-val')) {
            document.getElementById('long-press-timer-val').innerText = (window.longPressTimer || 500) / 1000;
        }
        this.updateSubpixelUI();


        this.makeShapeMenuDraggable();
        this.makeToolsDraggable();
    }

    closeAllMenus() {
        document.querySelectorAll('.context-menu, .shape-menu, .dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
        });
        const domModal = document.getElementById('draw-offset-modal');
        if (domModal) domModal.style.display = 'none';
    }

    hideAllStartupSubmenus() {
        ['startupMenu', 'startupModePicker', 'startupResPickerPixelate', 'startupResPickerAnimate', 'startupResPicker'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    bindGlobalEvents() {
        document.querySelectorAll('.ui-toggle-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const widgetId = e.target.getAttribute('data-widget');
                const widget = document.getElementById(widgetId);
                const label = e.target.nextElementSibling;
                if (e.target.checked) {
                    widget.style.display = widgetId === 'widget-timeline' ? 'block' : 'flex';
                    label.style.color = 'white';
                } else {
                    widget.style.display = 'none';
                    label.style.color = '#888';
                }
            });
        });
        
        const fileMenu = document.getElementById('file-menu');
        const scrollIndicator = document.getElementById('file-menu-scroll-indicator');
        if (fileMenu && scrollIndicator) {
            fileMenu.addEventListener('scroll', () => {
                scrollIndicator.innerHTML = Math.abs((fileMenu.scrollTop + fileMenu.clientHeight) - fileMenu.scrollHeight) <= 5 ? '▲' : '▼';
            });
            scrollIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                const isAtBottom = Math.abs((fileMenu.scrollTop + fileMenu.clientHeight) - fileMenu.scrollHeight) <= 5;
                fileMenu.scrollTo({ top: isAtBottom ? 0 : fileMenu.scrollHeight, behavior: 'smooth' });
            });
            scrollIndicator.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
            });
        }
        
        const settingsMenu = document.getElementById('settings-menu');
        const settingsScrollIndicator = document.getElementById('settings-menu-scroll-indicator');
        if (settingsMenu && settingsScrollIndicator) {
            const updateSettingsIndicator = () => {
                const hasOverflow = settingsMenu.scrollHeight > settingsMenu.clientHeight + 5;
                settingsScrollIndicator.style.display = hasOverflow ? 'flex' : 'none';
                if (hasOverflow) {
                    const isAtBottom = Math.abs((settingsMenu.scrollTop + settingsMenu.clientHeight) - settingsMenu.scrollHeight) <= 5;
                    settingsScrollIndicator.innerHTML = isAtBottom ? '▲' : '▼';
                }
            };
            settingsMenu.addEventListener('scroll', updateSettingsIndicator);
            settingsScrollIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                const isAtBottom = Math.abs((settingsMenu.scrollTop + settingsMenu.clientHeight) - settingsMenu.scrollHeight) <= 5;
                settingsMenu.scrollTo({ top: isAtBottom ? 0 : settingsMenu.scrollHeight, behavior: 'smooth' });
            });
            settingsScrollIndicator.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
            });
        }

        window.addEventListener('orientationchange', () => {
            ['widget-layers', 'widget-tools', 'widget-color', 'widget-brush'].forEach(id => {
                const w = document.getElementById(id);
                if (w) {
                    w.style.top = '';
                    w.style.left = '';
                    w.style.right = '';
                    w.style.bottom = '';
                }
            });
        });

        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]'); 
            if (!target) return;
            
            if (target.classList.contains('stop-propagation')) {
                e.stopPropagation();
            }
            
            const action = target.getAttribute('data-action');
            
            switch(action) {
                case 'showResPicker': 
                case 'showNewProjectModes':
                    this.hideAllStartupSubmenus();
                    const modePickerEl = document.getElementById('startupModePicker');
                    if (modePickerEl) modePickerEl.style.display = 'flex';
                    break;
                case 'showPixelateSizes':
                    this.hideAllStartupSubmenus();
                    const pixPickerEl = document.getElementById('startupResPickerPixelate');
                    if (pixPickerEl) pixPickerEl.style.display = 'flex';
                    break;
                case 'showAnimateSizes':
                    this.hideAllStartupSubmenus();
                    const animPickerEl = document.getElementById('startupResPickerAnimate');
                    if (animPickerEl) animPickerEl.style.display = 'flex';
                    break;
                case 'backToStartupMenu':
                    this.hideAllStartupSubmenus();
                    const startMenuEl = document.getElementById('startupMenu');
                    if (startMenuEl) startMenuEl.style.display = 'flex';
                    break;
                case 'backToModePicker':
                    this.hideAllStartupSubmenus();
                    const bModePickerEl = document.getElementById('startupModePicker');
                    if (bModePickerEl) bModePickerEl.style.display = 'flex';
                    break;
                case 'openProjectPrompt': 
                    document.getElementById('projectFileInput').click(); 
                    break;
                case 'resumeSession':
                    this.events.emit('core:resumeSession');
                    break;
                case 'startProject': 
                    this.events.emit('ui:hideStartupScreen');
                    this.events.emit('core:startProject', target.getAttribute('data-res')); 
                    break;
                case 'confirmNewProject': 
                    this.closeAllMenus(); 
                    document.getElementById('newProjectWarning').style.display = 'flex'; 
                    break;
                case 'reloadPage': 
                    document.getElementById('newProjectWarning').style.display = 'none';
                    document.getElementById('startupScreen').style.display = 'flex';
                    this.hideAllStartupSubmenus();
                    const rsm = document.getElementById('startupMenu');
                    if (rsm) rsm.style.display = 'flex';
                    
                    this.core.storage.clearSession();
                    this.core.history.clear();
                    
                    if (this.core.selection) {
                        this.core.selection.clear(false, false);
                    }
                    if (this.core.doc) {
                        this.core.doc.frames = [];
                    }
                    this.core.doc = null;
                    
                    if (this.core.bgCanvas) {
                        const bgCtx = this.core.bgCanvas.getContext('2d');
                        bgCtx.clearRect(0,0, this.core.bgCanvas.width, this.core.bgCanvas.height);
                        this.core.bgCanvas.style.backgroundImage = 'none';
                    }
                    
                    if (this.core.mainArtCanvas) this.core.mainArtCanvas.getContext('2d').clearRect(0,0, this.core.mainArtCanvas.width, this.core.mainArtCanvas.height);
                    if (this.core.spriteSheetViewCanvas) this.core.spriteSheetViewCanvas.getContext('2d').clearRect(0,0, this.core.spriteSheetViewCanvas.width, this.core.spriteSheetViewCanvas.height);
                    if (this.core.onionCtx) this.core.onionCtx.clearRect(0,0, this.core.onionCanvas.width, this.core.onionCanvas.height);
                    if (this.core.floatingCanvas) {
                        this.core.floatingCanvas.style.display = 'none';
                        this.core.floatingCanvas.style.transform = '';
                        const fCtx = this.core.floatingCanvas.getContext('2d');
                        if (fCtx && this.core.floatingCanvas.width > 0 && this.core.floatingCanvas.height > 0) {
                            fCtx.clearRect(0, 0, this.core.floatingCanvas.width, this.core.floatingCanvas.height);
                        }
                    }
                    if (this.core.selectionCanvas) {
                        const sCtx = this.core.selectionCanvas.getContext('2d');
                        if (sCtx && this.core.selectionCanvas.width > 0 && this.core.selectionCanvas.height > 0) {
                            sCtx.clearRect(0, 0, this.core.selectionCanvas.width, this.core.selectionCanvas.height);
                        }
                        this.core.selectionCanvas.width = 0;
                    }
                    
                    this.events.emit('ui:closeAllMenus');
                    document.getElementById('btn-resume-session').style.display = 'none';
                    break;
                case 'closeNewWarning': 
                    document.getElementById('newProjectWarning').style.display = 'none'; 
                    break;
                case 'saveProjectFile': 
                    this.events.emit('core:saveProjectFile'); 
                    break;
                case 'clearHistoryMemory': 
                    this.events.emit('core:clearHistoryMemory'); 
                    this.closeAllMenus(); 
                    break;
                case 'importImagePrompt': 
                    document.getElementById('fileInput').click(); 
                    break;
                case 'exportPNG': 
                    this.events.emit('core:exportPNG'); 
                    break;
                case 'toggleImageSizeMenu': 
                    e.stopPropagation(); 
                    const ism = document.getElementById('image-size-menu');
                    if (ism.style.display === 'flex') {
                        ism.style.display = 'none';
                    } else {
                        ism.style.display = 'flex';
                        const rect = target.getBoundingClientRect();
                        const ismH = ism.offsetHeight;
                        const ismW = ism.offsetWidth;
                        
                        let topPos = rect.top + (rect.height / 2) - (ismH / 2);
                        const minTop = 10;
                        const maxTop = window.innerHeight - ismH - 10;
                        topPos = Math.max(minTop, Math.min(topPos, maxTop));
                        ism.style.top = topPos + 'px';
                        
                        let rightPos = window.innerWidth - rect.left + 5;
                        if (window.innerWidth - rightPos < ismW + 10) {
                            ism.style.right = 'auto';
                            ism.style.left = '10px';
                        } else {
                            ism.style.right = rightPos + 'px';
                            ism.style.left = 'auto';
                        }
                    }
                    break;
                case 'resampleProject': 
                    this.events.emit('core:resampleProject', target.getAttribute('data-res')); 
                    this.closeAllMenus();
                    break;
                case 'toggleFileMenu': 
                    e.stopPropagation(); 
                    const fm = document.getElementById('file-menu');
                    const fmWasOpen = fm.style.display === 'flex';
                    this.closeAllMenus(); 
                    if (!fmWasOpen) {
                        fm.style.display = 'flex'; 
                        const ind = document.getElementById('file-menu-scroll-indicator');
                        if (ind) ind.innerHTML = Math.abs((fm.scrollTop + fm.clientHeight) - fm.scrollHeight) <= 5 ? '▲' : '▼';
                    }
                    break;
                case 'toggleSettingsMenu': 
                    e.stopPropagation(); 
                    const sm = document.getElementById('settings-menu');
                    const smWasOpen = sm.style.display === 'flex';
                    this.closeAllMenus(); 
                    if (!smWasOpen) {
                        if (typeof this.updateSubpixelUI === 'function') this.updateSubpixelUI();
                        sm.style.display = 'flex'; 
                        sm.scrollTop = 0;
                        const ind = document.getElementById('settings-menu-scroll-indicator');
                        if (ind) {
                            const hasOverflow = sm.scrollHeight > sm.clientHeight + 5;
                            ind.style.display = hasOverflow ? 'flex' : 'none';
                            if (hasOverflow) {
                                ind.innerHTML = Math.abs((sm.scrollTop + sm.clientHeight) - sm.scrollHeight) <= 5 ? '▲' : '▼';
                            }
                        }
                    }
                    break;
                case 'toggleSubpixelSmoothing':
                    e.stopPropagation();
                    const nextVal = !this.core.state.subpixelSmoothing;
                    this.core.state.setSubpixelSmoothing(nextVal);
                    this.updateSubpixelUI();
                    if (typeof this.core.updateCanvasSmoothing === 'function') {
                        this.core.updateCanvasSmoothing();
                    }
                    break;
                case 'openDrawOffsetModal':
                    e.stopPropagation();
                    this.closeAllMenus();
                    const domModal = document.getElementById('draw-offset-modal');
                    if (domModal) {
                        domModal.style.display = 'flex';
                        const dot = document.getElementById('draw-offset-dot');
                        if (dot && window.drawOffset) {
                            dot.style.transform = `translate(calc(-50% + ${window.drawOffset.x}px), calc(-50% + ${window.drawOffset.y}px))`;
                        }
                    }
                    break;
                case 'closeDrawOffsetModal':
                    e.stopPropagation();
                    const domModalClose = document.getElementById('draw-offset-modal');
                    if (domModalClose) {
                        domModalClose.style.display = 'none';
                    }
                    break;
                case 'resetDrawOffset':
                    e.stopPropagation();
                    window.drawOffset.x = 0;
                    window.drawOffset.y = 0;
                    localStorage.setItem('drawOffset_v1', JSON.stringify(window.drawOffset));
                    const domDot = document.getElementById('draw-offset-dot');
                    if (domDot) {
                        domDot.style.transform = `translate(-50%, -50%)`;
                    }
                    break;
                case 'toggleUIMenu': 
                    e.stopPropagation(); 
                    const um = document.getElementById('ui-menu');
                    const umWasOpen = um.style.display === 'flex';
                    this.closeAllMenus(); 
                    if (!umWasOpen) um.style.display = 'flex'; 
                    break;
                case 'toggleMirrorMain': 
                    e.stopPropagation(); 
                    const currentMode = this.core.state.mirrorMode;
                    const lastMode = this.core.lastMirrorMode || CONSTANTS.MIRROR.H;
                    if (currentMode !== CONSTANTS.MIRROR.NONE) {
                        this.events.emit('core:toggleMirror', currentMode);
                    } else {
                        this.events.emit('core:toggleMirror', lastMode);
                    }
                    break;
                case 'undo': 
                    this.events.emit('core:undo'); 
                    break;
                case 'redo': 
                    this.events.emit('core:redo'); 
                    break;
                case 'reframeViewport': 
                    this.events.emit('core:reframeViewport'); 
                    break;
                case 'toggleAllUI': 
                    document.body.classList.toggle('ui-hidden'); 
                    break;
                case 'toggleMirror': 
                    this.events.emit('core:toggleMirror', target.getAttribute('data-mirror')); 
                    this.closeAllMenus();
                    break;
                case 'setSelectTool': 
                    const bt = document.getElementById('btn-select'); 
                    bt.innerText = target.getAttribute('data-icon'); 
                    bt.setAttribute('data-tool', target.getAttribute('data-tool')); 
                    this.closeAllMenus(); 
                    this.events.emit('requestToolChange', target.getAttribute('data-tool')); 
                    break;
                case 'setBrushShape': 
                    this.events.emit('core:setBrushShape', target.getAttribute('data-shape')); 
                    document.getElementById('brushShapeMenu').style.display = 'none'; 
                    break;
                case 'setHSVColor': 
                    const hx = PaletteManager.rgbStrToHex(document.getElementById('hsvColorProxy').style.backgroundColor); 
                    this.events.emit('core:setHSVColor', hx); 
                    document.getElementById('hsvMenu').style.display = 'none'; 
                    break;
                case 'togglePalettePanel': 
                    e.stopPropagation(); 
                    this.events.emit('core:togglePalettePanel'); 
                    break;
                case 'toggleBrushPanel': 
                    e.stopPropagation(); 
                    this.events.emit('core:toggleBrushPanel'); 
                    break;
                case 'addCustomBrush':
                    this.events.emit('core:addCustomBrush');
                    break;
                case 'selectBrushSwatch':
                    const brushShape = target.getAttribute('data-shape');
                    const brushSize = parseInt(target.getAttribute('data-size'));
                    const brushOpacity = parseFloat(target.getAttribute('data-opacity'));
                    this.events.emit('core:selectBrushSwatch', { shape: brushShape, size: brushSize, opacity: brushOpacity });
                    document.querySelectorAll('#brushPanel .swatch').forEach(s => s.classList.remove('selected')); 
                    target.classList.add('selected');
                    break;
                case 'selectColorSwatch': 
                    const color = target.getAttribute('data-color');
                    this.core.palette.setCurrentColor(color); 
                    document.getElementById('currentColorDisplay').style.backgroundColor = color;
                    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected')); 
                    target.classList.add('selected');
                    this.syncHSVFromHex(color);
                    break;
                case 'togglePaletteSection': 
                    const grid = document.getElementById(target.getAttribute('data-target')); 
                    grid.classList.toggle('collapsed'); 
                    document.getElementById(target.getAttribute('data-chevron')).innerText = grid.classList.contains('collapsed') ? '▶' : '▼'; 
                    break;
                case 'toggleHSVMenu': 
                    e.stopPropagation(); 
                    const hmenu = document.getElementById('hsvMenu'); 
                    if(hmenu.style.display === 'flex') {
                        hmenu.style.display = 'none'; 
                    } else { 
                        this.closeAllMenus(); 
                        hmenu.style.display = 'flex'; 
                    } 
                    break;
                case 'addCustomColor': 
                    const nHex = PaletteManager.rgbStrToHex(document.getElementById('customColorProxy').style.backgroundColor); 
                    this.events.emit('core:addCustomColor', nHex); 
                    break;
                case 'toggleTimeline': 
                    if (window.isDraggingTimeline) return;
                    const tw = document.getElementById('widget-timeline'); 
                    tw.classList.toggle('collapsed'); 
                    document.getElementById('handle-timeline').innerText = tw.classList.contains('collapsed') ? 'TIMELINE ▲' : 'TIMELINE ▼'; 
                    if (!tw.classList.contains('collapsed')) {
                        this.setTimelineExpansionLevel(this.timelineLevel || 1);
                    }
                    break;
                case 'toggleSpriteSheetView': 
                    this.events.emit('core:toggleSpriteSheetView'); 
                    break;
                case 'toggleOnionSkin': 
                    this.events.emit('core:toggleOnionSkin'); 
                    break;
                case 'togglePlay': 
                    this.events.emit('core:togglePlay'); 
                    break;
                case 'addFrame': 
                    this.events.emit('core:addFrame'); 
                    break;
                case 'copyContextFrame': 
                    this.closeAllMenus(); 
                    this.events.emit('core:copyLayerFrame', this.contextMenuLayerIndex, this.contextMenuFrameIndex); 
                    break;
                case 'deleteContextFrame': 
                    this.closeAllMenus(); 
                    this.events.emit('core:deleteLayerFrame', this.contextMenuLayerIndex, this.contextMenuFrameIndex); 
                    break;
                case 'toggleActiveLayerVisibility': 
                    this.events.emit('core:toggleActiveLayerVisibility'); 
                    break;
                case 'toggleActiveLayerLock': 
                    this.events.emit('core:toggleActiveLayerLock'); 
                    break;
                case 'duplicateActiveLayer': 
                    this.closeAllMenus(); 
                    this.events.emit('core:duplicateActiveLayer'); 
                    break;
                case 'openLayerAdjustMenu':
                    this.closeAllMenus();
                    this.events.emit('ui:openLayerAdjustMenu');
                    break;
                case 'applyLayerAdjust':
                    this.events.emit('ui:applyLayerAdjust');
                    break;
                case 'cancelLayerAdjust':
                    this.events.emit('ui:cancelLayerAdjust');
                    break;
                case 'desaturateLayer':
                    document.getElementById('la-hsv-h').value = 0;
                    document.getElementById('la-hsv-s').value = -100;
                    document.getElementById('la-hsv-v').value = 0;
                    document.getElementById('la-contrast').value = 0;
                    this.events.emit('ui:updateLayerAdjust');
                    break;
                case 'mergeLayerDown': 
                    this.closeAllMenus(); 
                    this.events.emit('core:mergeLayerDown'); 
                    break;
                case 'addLayer': 
                    this.events.emit('core:addLayer'); 
                    break;
                case 'deleteLayer': 
                    this.closeAllMenus(); 
                    this.events.emit('core:deleteLayer'); 
                    break;
                case 'paste': 
                    this.events.emit('core:radialPaste'); 
                    break;
                case 'copy': 
                    this.events.emit('core:radialCopy'); 
                    break;
                case 'duplicate': 
                    this.events.emit('core:radialDuplicate'); 
                    break;
                case 'fliph': 
                    this.events.emit('core:radialFlip', CONSTANTS.MIRROR.H); 
                    break;
                case 'flipv': 
                    this.events.emit('core:radialFlip', CONSTANTS.MIRROR.V); 
                    break;
                case 'cut': 
                    this.events.emit('core:radialCut'); 
                    break;
            }
        });

        document.getElementById('fileInput').addEventListener('change', (e) => this.events.emit('core:importImage', e));
        document.getElementById('projectFileInput').addEventListener('change', (e) => this.events.emit('core:loadProjectFile', e));

        document.addEventListener('pointerdown', (e) => {
            const menus = [ 
                { id: 'hsvMenu', excludes: ['#hsvMenu', '#customColorProxy'] }, 
                { id: 'layerMenu', excludes: ['#layerMenu', '.layer-square'] }, 
                { id: 'layerLongPressMenu', excludes: ['#layerLongPressMenu', '.layer-square'] }, 
                { id: 'layerAdjustMenu', excludes: ['#layerAdjustMenu', '[data-action="openLayerAdjustMenu"]'], extraCallback: () => this.events.emit('ui:applyLayerAdjust') },
                { id: 'palettePanel', excludes: ['#palettePanel', '#btn-palette-toggle', '#hsvMenu'] }, 
                { id: 'brushPanel', excludes: ['#brushPanel', '#btn-brush-toggle'] },
                { id: 'frameMenu', excludes: ['#frameMenu', '.frame-square'] }, 
                { id: 'file-menu', excludes: ['#file-menu', '#btn-file-menu', '#image-size-menu'], extraCallback: () => document.getElementById('image-size-menu').style.display = 'none' }, 
                { id: 'image-size-menu', excludes: ['#image-size-menu', '#btn-image-size'] },
                { id: 'mirror-menu', excludes: ['#mirror-menu', '#btn-mirror-menu'] }, 
                { id: 'brushShapeMenu', excludes: ['#brushShapeMenu', '.tool-btn'] },
                { id: 'shapeMenu', excludes: ['#shapeMenu', '#btn-shape'] },
                { id: 'selectMenu', excludes: ['#selectMenu', '#btn-select'] },
                { id: 'onionSkinMenu', excludes: ['#onionSkinMenu', '#onionToggleBtn'] },
                { id: 'playbackMenu', excludes: ['#playbackMenu', '#btn-play'] },
                { id: 'settings-menu', excludes: ['#settings-menu', '#btn-settings-menu'] }
            ];
            menus.forEach(mc => {
                const el = document.getElementById(mc.id);
                if (el && (el.style.display === 'flex' || el.style.display === 'block')) {
                    if (!mc.excludes.some(selector => e.target.closest(selector))) { 
                        el.style.display = 'none'; 
                        if (mc.extraCallback) mc.extraCallback(); 
                    }
                }
            });
        });
    }

    bindExtraUI() {
        const bindLongPress = (btn, menuId, position = 'bottom') => {
            let timer = null, isLongPress = false;
            let startX = 0, startY = 0;
            btn.addEventListener('pointerdown', (e) => {
                isLongPress = false;
                startX = e.clientX;
                startY = e.clientY;
                timer = setTimeout(() => {
                    isLongPress = true; if (navigator.vibrate) navigator.vibrate(40);
                    this.closeAllMenus();
                    const menu = document.getElementById(menuId);
                    menu.style.display = 'flex';
                    menu.style.flexDirection = 'column';

                    const rect = btn.getBoundingClientRect();
                    let leftPos = rect.left;
                    
                    if (position === 'top-center') {
                        leftPos = rect.left + (rect.width / 2) - (menu.offsetWidth / 2);
                    }
                    
                    if (leftPos + menu.offsetWidth > window.innerWidth - 10) {
                        leftPos = window.innerWidth - menu.offsetWidth - 10;
                    }
                    menu.style.left = Math.max(10, leftPos) + 'px';
                    
                    if (position === 'bottom') {
                        menu.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
                        menu.style.top = 'auto';
                    } else {
                        let topPos = rect.bottom + 10;
                        if (topPos + menu.offsetHeight > window.innerHeight - 10) topPos = window.innerHeight - menu.offsetHeight - 10;
                        menu.style.top = Math.max(10, topPos) + 'px';
                        menu.style.bottom = 'auto';
                    }
                    
                }, window.longPressTimer || 500);
            });
            btn.addEventListener('pointermove', (e) => { 
                if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
                    clearTimeout(timer); 
                }
            });
            btn.addEventListener('pointerup', (e) => {
                clearTimeout(timer);
                if (isLongPress) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            });
            btn.addEventListener('pointercancel', () => clearTimeout(timer));
            btn.addEventListener('click', (e) => {
                if (isLongPress) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            });
        };

        const onionBtn = document.getElementById('onionToggleBtn');
        if (onionBtn) bindLongPress(onionBtn, 'onionSkinMenu');
        
        const playBtn = document.getElementById('btn-play');
        if (playBtn) bindLongPress(playBtn, 'playbackMenu');
        
        const uiBtn = document.getElementById('btn-ui-menu');
        if (uiBtn) bindLongPress(uiBtn, 'ui-menu', 'top');
        
        const mirrorBtn = document.getElementById('btn-mirror-menu');
        if (mirrorBtn) bindLongPress(mirrorBtn, 'mirror-menu', 'top-center');

        // Onion Skin sliders
        const setupSlider = (valId, prop, isFps = false) => {
            const dragEl = document.getElementById(valId);
            const textEl = isFps ? document.getElementById(valId + '-text') : dragEl;
            if (!dragEl || !textEl) return;
            
            new UIDragInteraction(dragEl, {
                stopPropagation: true,
                preventDefaultOnMove: true,
                onDown: (e, inst) => {
                    inst.customData.startVal = parseInt(textEl.innerText, 10);
                },
                onDragMove: (e, dx, dy, inst) => {
                    let maxVal = isFps ? 30 : 6;
                    let minVal = isFps ? 1 : 0;
                    let newVal = Math.max(minVal, Math.min(maxVal, inst.customData.startVal - Math.round(dy / 10)));
                    textEl.innerText = newVal;
                    
                    if (isFps) {
                        this.core.playback.setFPS(newVal);
                    } else {
                        this.core.playback[prop] = newVal;
                        this.core.playback.updateOnionSkin();
                    }
                }
            });
        };

        setupSlider('onion-before-val', 'onionFramesBefore');
        setupSlider('onion-after-val', 'onionFramesAfter');
        setupSlider('fps-val', 'fps', true);

        // Loop options
        document.querySelectorAll('.loop-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.loop-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.backgroundColor = '';
                    b.style.color = '';
                });
                btn.classList.add('active');
                btn.style.backgroundColor = 'var(--accent)';
                btn.style.color = 'white';
                this.core.playback.setLoopMode(btn.getAttribute('data-loop'));
            });
        });



        // Menu Collapsing
        ['handle-tools', 'handle-color', 'handle-layers', 'handle-brush'].forEach(handleId => {
            const handle = document.getElementById(handleId);
            if (handle) {
                let pstartX = 0, pstartY = 0;
                handle.addEventListener('pointerdown', e => {
                    pstartX = e.clientX; pstartY = e.clientY;
                });
                handle.addEventListener('click', (e) => {
                    if (Math.abs(e.clientX - pstartX) > 5 || Math.abs(e.clientY - pstartY) > 5) return;
                    const widget = handle.closest('.widget');
                    const toolbar = widget.querySelector('.toolbar');
                    if (toolbar.style.display === 'none') {
                        toolbar.style.display = '';
                    } else {
                        toolbar.style.display = 'none';
                    }
                });
            }
        });
    }

    setTool(tool) {
        this.closeAllMenus();
        document.querySelectorAll('#toolStack .tool-btn').forEach(b => b.classList.remove('active'));
        
        if ([CONSTANTS.TOOLS.LINE, CONSTANTS.TOOLS.RECT, CONSTANTS.TOOLS.ELLIPSE].includes(tool)) {
            document.getElementById('btn-shape').classList.add('active');
        } else if ([CONSTANTS.TOOLS.WAND, CONSTANTS.TOOLS.MARQUEE, CONSTANTS.TOOLS.POLYGON, CONSTANTS.TOOLS.COLOR_SELECT, CONSTANTS.TOOLS.LASSO].includes(tool)) {
            document.getElementById('btn-select').classList.add('active');
        } else { 
            const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`); 
            if (btn) btn.classList.add('active'); 
        }
    }

    toggleSpriteSheetUI(isActive) {
        const btn = document.getElementById('sheetToggleBtn');
        const uiElements = ['widget-layers', 'widget-tools', 'widget-color', 'widget-brush', 'selectionCanvas', 'dragHandle', 'radialMenu'];
        
        if (isActive) {
            btn.innerText = 'Canvas';
            uiElements.forEach(id => { 
                if(document.getElementById(id)) {
                    document.getElementById(id).style.display = 'none'; 
                }
            });
            this.core.onionCanvas.style.display = 'none'; 
            this.core.mainArtCanvas.style.display = 'none';
            this.core.spriteSheetViewCanvas.style.display = 'block';
        } else {
            btn.innerText = 'Spritesheet';
            uiElements.forEach(id => { 
                if(document.getElementById(id) && id !== 'radialMenu' && id !== 'dragHandle') {
                    document.getElementById(id).style.display = 'flex'; 
                }
            });
            this.core.spriteSheetViewCanvas.style.display = 'none'; 
            this.core.mainArtCanvas.style.display = 'block';
            
            if (this.core.selection.isActive && !this.core.selection.isAntsAnimating) { 
                this.core.selection.isAntsAnimating = true; 
                requestAnimationFrame(this.core.selection.animateAnts); 
            }
        }
    }

    createSwatch(color, container) {
        const swatch = document.createElement('div'); 
        swatch.className = 'swatch'; 
        swatch.style.backgroundColor = color;
        swatch.setAttribute('data-action', 'selectColorSwatch');
        swatch.setAttribute('data-color', color);
        container.appendChild(swatch);
    }

    syncHSVFromHex(hex) {
        const rgb = PaletteManager.hexToRgb(hex);
        const hsv = PaletteManager.rgbToHsv(rgb.r, rgb.g, rgb.b);
        
        document.getElementById('hsv-h').value = hsv.h; 
        document.getElementById('hsv-s').value = Math.round(hsv.s * 100); 
        document.getElementById('hsv-v').value = Math.round(hsv.v * 100);
        document.getElementById('hsvColorProxy').style.backgroundColor = hex;
        
        const grads = PaletteManager.getSliderGradients(hsv.h, hsv.s, hsv.v);
        document.getElementById('track-h').style.background = grads.hTrack; 
        document.getElementById('track-s').style.background = grads.sTrack; 
        document.getElementById('track-v').style.background = grads.vTrack;
    }

    initPalettes() {
        this.core.palette.swatchesColors.forEach(c => this.createSwatch(c, document.getElementById('swatchesGrid')));
        this.core.palette.greyscaleColors.forEach(c => this.createSwatch(c, document.getElementById('greyscaleGrid')));
        this.core.palette.setCurrentColor('#000000'); 
        
        document.getElementById('currentColorDisplay').style.backgroundColor = '#000000'; 
        document.getElementById('customColorProxy').style.backgroundColor = '#FFFFFF';
        this.syncHSVFromHex('#FFFFFF');
        
        ['hsv-h', 'hsv-s', 'hsv-v'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                const h = parseInt(document.getElementById('hsv-h').value);
                const s = parseInt(document.getElementById('hsv-s').value) / 100;
                const v = parseInt(document.getElementById('hsv-v').value) / 100;
                const hex = PaletteManager.hsvToHex(h, s, v);
                
                document.getElementById('customColorProxy').style.backgroundColor = hex; 
                document.getElementById('hsvColorProxy').style.backgroundColor = hex;
                
                const grads = PaletteManager.getSliderGradients(h, s, v);
                document.getElementById('track-h').style.background = grads.hTrack; 
                document.getElementById('track-s').style.background = grads.sTrack; 
                document.getElementById('track-v').style.background = grads.vTrack;
            });
        });

        ['la-hsv-h', 'la-hsv-s', 'la-hsv-v', 'la-contrast'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                this.events.emit('ui:updateLayerAdjust');
                
                // Update gradients based on offset sliders
                const hOff = parseInt(document.getElementById('la-hsv-h').value);
                const sOff = parseInt(document.getElementById('la-hsv-s').value);
                const vOff = parseInt(document.getElementById('la-hsv-v').value);
                
                // Base colors to show shift (starting from a neutral red/gray)
                let baseH = (0 + hOff + 360) % 360;
                let baseS = Math.max(0, Math.min(1, 0.5 + sOff / 100));
                let baseV = Math.max(0, Math.min(1, 0.5 + vOff / 100));
                
                const grads = PaletteManager.getSliderGradients(baseH, baseS, baseV);
                document.getElementById('track-la-h').style.background = grads.hTrack;
                document.getElementById('track-la-s').style.background = `linear-gradient(to right, ${PaletteManager.hsvToHex(baseH, 0, baseV)}, ${PaletteManager.hsvToHex(baseH, 1, baseV)})`;
                document.getElementById('track-la-v').style.background = `linear-gradient(to right, #000000, ${PaletteManager.hsvToHex(baseH, baseS, 1)})`;
                
                // Contrast slider gradient (gray to high contrast black/white representation)
                document.getElementById('track-la-c').style.background = `linear-gradient(to right, #777, #fff)`;
            });
        });

        const setupSliderTrack = (trackId, inputId) => {
            const track = document.getElementById(trackId);
            const input = document.getElementById(inputId);
            if (!track || !input) return;

            let isDragging = false;

            const updateFromPointer = (e, forceDispatch = false) => {
                const rect = track.getBoundingClientRect();
                if (rect.width <= 0) return;
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const min = parseFloat(input.min !== '' ? input.min : '0');
                const max = parseFloat(input.max !== '' ? input.max : '100');
                const stepAttr = input.getAttribute('step');
                const step = (stepAttr && stepAttr !== 'any') ? parseFloat(stepAttr) : 1;

                let val = min + ratio * (max - min);
                if (step > 0) {
                    val = Math.round((val - min) / step) * step + min;
                }
                val = Math.max(min, Math.min(max, val));

                if (forceDispatch || parseFloat(input.value) !== val) {
                    input.value = val;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            };

            track.addEventListener('pointerdown', (e) => {
                if (e.button !== undefined && e.button !== 0) return;
                isDragging = true;
                try { track.setPointerCapture(e.pointerId); } catch (_) {}
                updateFromPointer(e, true);
            });

            track.addEventListener('pointermove', (e) => {
                if (!isDragging) return;
                updateFromPointer(e, false);
            });

            const onPointerEnd = (e) => {
                if (!isDragging) return;
                isDragging = false;
                try {
                    if (track.hasPointerCapture && track.hasPointerCapture(e.pointerId)) {
                        track.releasePointerCapture(e.pointerId);
                    }
                } catch (_) {}
            };

            track.addEventListener('pointerup', onPointerEnd);
            track.addEventListener('pointercancel', onPointerEnd);
            window.addEventListener('pointerup', (e) => {
                if (isDragging) onPointerEnd(e);
            }, { passive: true });
            window.addEventListener('pointercancel', (e) => {
                if (isDragging) onPointerEnd(e);
            }, { passive: true });
        };

        [
            ['track-h', 'hsv-h'],
            ['track-s', 'hsv-s'],
            ['track-v', 'hsv-v'],
            ['track-la-h', 'la-hsv-h'],
            ['track-la-s', 'la-hsv-s'],
            ['track-la-v', 'la-hsv-v'],
            ['track-la-c', 'la-contrast']
        ].forEach(([trackId, inputId]) => setupSliderTrack(trackId, inputId));
    }

    createLayerNode() {
        const square = document.createElement('div'); 
        square.className = 'layer-square';
        let layerDragTimer, longPressed = false, isDraggingLayer = false, hasScrolled = false, startX, startY, dragGhost = null;
        
        square.addEventListener('touchmove', (e) => { 
            if (longPressed) e.preventDefault(); 
        }, { passive: false });
        
        const onMove = (em) => {
            const dx = em.clientX - startX;
            const dy = em.clientY - startY;
            
            if (!longPressed) { 
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { 
                    clearTimeout(layerDragTimer); 
                    hasScrolled = true; 
                } 
                return; 
            }
            
            if (longPressed) {
                if (!isDraggingLayer && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
                    isDraggingLayer = true; 
                    dragGhost = square.cloneNode(true);
                    dragGhost.style.position = 'fixed'; 
                    dragGhost.style.opacity = '0.85'; 
                    dragGhost.style.pointerEvents = 'none'; 
                    dragGhost.style.zIndex = '1000'; 
                    dragGhost.classList.add('active'); 
                    document.body.appendChild(dragGhost);
                }
                if (isDraggingLayer && dragGhost) { 
                    dragGhost.style.left = (em.clientX - 18) + 'px'; 
                    dragGhost.style.top = (em.clientY - 18) + 'px'; 
                }
            }
        };
        
        const onUp = (eu) => {
            const currentIndex = parseInt(square.dataset.index, 10);
            clearTimeout(layerDragTimer); 
            square.style.transform = '';
            
            try { square.releasePointerCapture(eu.pointerId); } catch(err) {}
            
            square.removeEventListener('pointermove', onMove); 
            square.removeEventListener('pointerup', onUp); 
            square.removeEventListener('pointercancel', onUp);
            
            if (isDraggingLayer) {
                const stack = document.getElementById('layerStack');
                const stackRect = stack.getBoundingClientRect();
                const currentLayers = this.core.doc.activeFrame.layers;
                
                let visualIndex = Math.floor((eu.clientY - stackRect.top + stack.scrollTop) / 42);
                let dropIndex = visualIndex; 
                dropIndex = Math.max(0, Math.min(currentLayers.length - 1, dropIndex));
                
                this.core.doc.frames.forEach(f => { 
                    const movedLayer = f.layers.splice(currentIndex, 1)[0]; 
                    f.layers.splice(dropIndex, 0, movedLayer); 
                    f.layers.forEach((l, idx) => {
                        l._name = `L${idx + 1}`;
                    });
                });
                
                if (this.core.doc.activeLayerIndex === currentIndex) {
                    this.core.doc.activeLayerIndex = dropIndex;
                } else if (this.core.doc.activeLayerIndex > currentIndex && this.core.doc.activeLayerIndex <= dropIndex) {
                    this.core.doc.activeLayerIndex--;
                } else if (this.core.doc.activeLayerIndex < currentIndex && this.core.doc.activeLayerIndex >= dropIndex) {
                    this.core.doc.activeLayerIndex++;
                }
                
                if (dragGhost) { 
                    document.body.removeChild(dragGhost); 
                    dragGhost = null; 
                }
                
                this.events.emit('ui:layerChanged'); 
                this.events.emit('ui:frameChanged'); 
                if (this.core.renderer) this.core.renderer.render(); 
                this.core.saveState();
            } else if (longPressed && !hasScrolled) {
                const lpMenu = document.getElementById('layerLongPressMenu');
                const wasOpen = lpMenu.style.display === 'flex' && this.core.doc.activeLayerIndex === currentIndex;
                
                this.events.emit('core:selectLayer', currentIndex);
                
                if (wasOpen) {
                    lpMenu.style.display = 'none';
                } else {
                    this.closeAllMenus(); 
                    lpMenu.style.display = 'flex';
                    
                    const rect = square.getBoundingClientRect();
                    const menuRect = lpMenu.getBoundingClientRect();
                    
                    let leftPos = rect.right + 10; 
                    if (leftPos + menuRect.width > window.innerWidth - 10) {
                        leftPos = rect.left - menuRect.width - 10;
                    }
                    
                    lpMenu.style.left = leftPos + 'px'; 
                    let topPos = rect.top;
                    if (topPos + menuRect.height > window.innerHeight - 10) topPos = window.innerHeight - menuRect.height - 10;
                    lpMenu.style.top = Math.max(10, topPos) + 'px';
                }
            } else if (!longPressed && !hasScrolled) {
                const menu = document.getElementById('layerMenu');
                const wasOpen = menu.style.display === 'flex' && this.core.doc.activeLayerIndex === currentIndex;

                
                this.events.emit('core:selectLayer', currentIndex);
                
                if (wasOpen) {
                    menu.style.display = 'none';
                } else {
                    this.closeAllMenus(); 
                    menu.style.display = 'flex';
                    
                    const rect = square.getBoundingClientRect();
                    const menuRect = menu.getBoundingClientRect();
                    
                    let leftPos = rect.right + 10; 
                    if (leftPos + menuRect.width > window.innerWidth - 10) {
                        leftPos = rect.left - menuRect.width - 10;
                    }
                    
                    menu.style.left = leftPos + 'px'; 
                    let topPos = rect.top;
                    if (topPos + menuRect.height > window.innerHeight - 10) topPos = window.innerHeight - menuRect.height - 10;
                    menu.style.top = Math.max(10, topPos) + 'px';
                    
                    const l = this.core.doc.activeFrame.layers[currentIndex];
                    document.getElementById('lm-vis').innerText = l.visible ? '👁️' : '🙈'; 
                    document.getElementById('lm-lock').innerText = l.locked ? '🔐' : '🔓';
                    document.getElementById('lm-opacity').innerText = Math.round(l.opacity * 100); 
                    const canMergeDown = currentIndex < this.core.doc.activeFrame.layers.length - 1;
                    document.getElementById('lm-merge').style.display = canMergeDown ? 'block' : 'none';
                }
            }
        };
        
        square.addEventListener('pointerdown', (e) => {
            if (this.core.playback.isPlaying || this.core.state.isSpriteSheetView) return;
            
            longPressed = false; 
            isDraggingLayer = false; 
            hasScrolled = false; 
            startX = e.clientX; 
            startY = e.clientY;
            
            layerDragTimer = setTimeout(() => { 
                longPressed = true; if (navigator.vibrate) navigator.vibrate(40); 
                square.style.transform = 'scale(1.15)'; 
                try { square.setPointerCapture(e.pointerId); } catch(err) {} 
                this.closeAllMenus(); 
            }, window.longPressTimer || 400);
            
            square.addEventListener('pointermove', onMove); 
            square.addEventListener('pointerup', onUp); 
            square.addEventListener('pointercancel', onUp);
        });
        
        return square;
    }


    getLayerName(layerObj, index) {
        const name = `L${index + 1}`;
        if (layerObj) layerObj._name = name;
        if (this.core && this.core.doc && this.core.doc.frames) {
            this.core.doc.frames.forEach(f => {
                if (f.layers && f.layers[index]) f.layers[index]._name = name;
            });
        }
        return name;
    }
    updateLayerStackUI() {
        if (!this.core.doc) return;
        const stack = document.getElementById('layerStack');
        const currentLayers = this.core.doc.activeFrame.layers;
        
        while (stack.children.length < currentLayers.length) stack.appendChild(this.createLayerNode());
        while (stack.children.length > currentLayers.length) stack.removeChild(stack.lastChild);
        
        for (let i = 0; i < currentLayers.length; i++) {
            const layerObj = currentLayers[i];
            const visualIndex = i;
            const square = stack.children[visualIndex];
            
            square.dataset.index = i; 
            square.classList.toggle('active', i === this.core.doc.activeLayerIndex);
            square.classList.toggle('hidden-layer', !layerObj.visible); 
            const lName = this.getLayerName(layerObj, i);
            square.innerText = layerObj.locked ? `🔐${lName.substring(1)}` : lName;
        }
        
        const ind = document.getElementById('layerScrollIndicator'); 
        ind.style.display = (stack && stack.scrollHeight > stack.clientHeight && Math.ceil(stack.scrollTop + stack.clientHeight) < stack.scrollHeight) ? 'block' : 'none';

        const layerMenu = document.getElementById('layerMenu');
        if (layerMenu && layerMenu.style.display === 'flex') {
            const activeIdx = this.core.doc.activeLayerIndex;
            const activeLayer = this.core.doc.activeFrame.layers[activeIdx];
            if (activeLayer) {
                document.getElementById('lm-vis').innerText = activeLayer.visible ? '👁️' : '🙈'; 
                document.getElementById('lm-lock').innerText = activeLayer.locked ? '🔐' : '🔓';
                document.getElementById('lm-opacity').innerText = Math.round(activeLayer.opacity * 100);
                const canMergeDown = activeIdx < this.core.doc.activeFrame.layers.length - 1;
                document.getElementById('lm-merge').style.display = canMergeDown ? 'block' : 'none';
            }
        }
    }

    getFrameX(index) {
        if (!this.core.doc) return 0;
        return index * 61;
    }

    getFrameIndexAtX(targetX) {
        if (!this.core.doc) return 0;
        return Math.max(0, Math.min(this.core.doc.frames.length - 1, Math.round(targetX / 61)));
    }

    applyScrubPosition(pos) {
        if (!this.core.doc) return;
        const strip = document.getElementById('timelineStrip');
        if (!strip) return;

        const clampedIndex = this.getFrameIndexAtX(pos);
        
        // Continuous smooth scrolling centering the current position in the strip
        const targetScroll = pos - (strip.clientWidth / 2) + 31;
        strip.scrollLeft = targetScroll;

        // Directly sync the frame number row transform without waiting for async scroll event
        const row = document.getElementById('frameNumberRow');
        if (row) row.style.transform = `translateX(${-strip.scrollLeft}px)`;

        if (clampedIndex !== this.core.doc.currentFrameIndex) {
            this.events.emit('core:switchFrame', clampedIndex);
        }
    }

    cancelScrubMomentum() {
        if (this._scrubMomentumRaf) {
            cancelAnimationFrame(this._scrubMomentumRaf);
            this._scrubMomentumRaf = null;
            if (this.core && typeof this.core.finishScrubbing === 'function') {
                this.core.finishScrubbing();
            }
        }
    }

    // velocity is in scrub-position px per second; decays with exponential friction
    startScrubMomentum(startPos, velocity) {
        this.cancelScrubMomentum();
        const MIN_START = 150, MIN_STOP = 30, FRICTION = 3.5;
        if (Math.abs(velocity) < MIN_START) {
            if (this.core && typeof this.core.finishScrubbing === 'function') {
                this.core.finishScrubbing();
            }
            return;
        }
        if (this.core && typeof this.core.startScrubbing === 'function') {
            this.core.startScrubbing();
        }
        velocity = Math.max(-6000, Math.min(6000, velocity));
        const maxPos = this.getFrameX(this.core.doc.frames.length - 1);
        let pos = startPos, last = performance.now();

        const step = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!this.core.doc || this.core.playback.isPlaying || this.core.state.isSpriteSheetView) {
                this._scrubMomentumRaf = null;
                if (this.core && typeof this.core.finishScrubbing === 'function') {
                    this.core.finishScrubbing();
                }
                return;
            }
            pos += velocity * dt;
            velocity *= Math.exp(-FRICTION * dt);
            if (pos < 0) { pos = 0; velocity = 0; }
            else if (pos > maxPos) { pos = maxPos; velocity = 0; }
            this.applyScrubPosition(pos);
            if (Math.abs(velocity) < MIN_STOP || pos <= 0 || pos >= maxPos) {
                this._scrubMomentumRaf = null;
                const finalIndex = this.getFrameIndexAtX(pos);
                this.applyScrubPosition(this.getFrameX(finalIndex));
                if (this.core && typeof this.core.finishScrubbing === 'function') {
                    this.core.finishScrubbing();
                }
                return;
            }
            this._scrubMomentumRaf = requestAnimationFrame(step);
        };
        this._scrubMomentumRaf = requestAnimationFrame(step);
    }

    createFrameNode() {
        const square = document.createElement('div'); 
        square.className = 'frame-square';
        
        let frameDragTimer, longPressed = false, isDraggingFrame = false, hasScrolled = false, startX, startY, dragGhost = null, scrubStartScroll = 0;
        let scrubSamples = [], scrubPos = 0;
        
        square.addEventListener('touchmove', (e) => { 
            if (longPressed) e.preventDefault(); 
        }, { passive: false });
        
        const onMove = (em) => {
            const dx = em.clientX - startX;
            const dy = em.clientY - startY;
            
            if (!longPressed) { 
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { 
                    clearTimeout(frameDragTimer); 
                    hasScrolled = true; 
                } 
                scrubSamples.push({ t: performance.now(), x: em.clientX });
                if (scrubSamples.length > 12) scrubSamples.shift();
                if (hasScrolled && !this.core.playback.isPlaying && !this.core.state.isSpriteSheetView) {
                    if (this.core && typeof this.core.startScrubbing === 'function') {
                        this.core.startScrubbing();
                    }
                    scrubPos = scrubStartScroll - dx;
                    this.applyScrubPosition(scrubPos);
                }
                return; 
            }
            
            if (longPressed) {
                if (!isDraggingFrame && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
                    isDraggingFrame = true; 
                    dragGhost = square.cloneNode(true);
                    dragGhost.style.position = 'fixed'; 
                    dragGhost.style.opacity = '0.85'; 
                    dragGhost.style.pointerEvents = 'none'; 
                    dragGhost.style.zIndex = '1000'; 
                    document.body.appendChild(dragGhost);
                }
                if (isDraggingFrame && dragGhost) { 
                    dragGhost.style.left = (em.clientX - 27) + 'px'; 
                    dragGhost.style.top = (em.clientY - 27) + 'px'; 
                }
            }
        };
        
        const onUp = (eu) => {
            const currentIndex = parseInt(square.dataset.frameIndex, 10);
            clearTimeout(frameDragTimer); 
            square.style.transform = '';
            
            try { square.releasePointerCapture(eu.pointerId); } catch(err) {}
            
            square.removeEventListener('pointermove', onMove); 
            square.removeEventListener('pointerup', onUp); 
            square.removeEventListener('pointercancel', onUp);
            
            if (isDraggingFrame) {
                const strip = document.getElementById('timelineStrip');
                const stripRect = strip.getBoundingClientRect();
                
                const dropX = eu.clientX - stripRect.left + strip.scrollLeft;
                const dropIndex = this.getFrameIndexAtX(dropX);
                
                const movedFrame = this.core.doc.frames.splice(currentIndex, 1)[0]; 
                this.core.doc.frames.splice(dropIndex, 0, movedFrame);
                
                if (dragGhost) { 
                    document.body.removeChild(dragGhost); 
                    dragGhost = null; 
                }
                
                this.events.emit('ui:frameChanged'); 
                this.events.emit('core:switchFrame', dropIndex); 
                this.core.saveState();
            } else if (longPressed) {
                this.closeAllMenus(); 
                this.contextMenuFrameIndex = currentIndex;
                this.contextMenuLayerIndex = this.core.doc.activeLayerIndex;
                
                const menu = document.getElementById('frameMenu'); 
                menu.style.display = 'flex';
                
                let x = eu.clientX; 
                if (x + 120 > window.innerWidth) x = window.innerWidth - 120;
                menu.style.left = x + 'px'; 
                menu.style.top = (eu.clientY - 70) + 'px';
            } else if (!hasScrolled) {
                if (!this.core.playback.isPlaying && !this.core.state.isSpriteSheetView) { 
                    this.events.emit('core:switchFrame', currentIndex); 
                }
            } else {
                let momentumStarted = false;
                if (this.core.doc && !this.core.playback.isPlaying && !this.core.state.isSpriteSheetView && eu.type === 'pointerup') {
                    // Fling: estimate release velocity from the last ~120ms of samples
                    const now = performance.now();
                    const recent = scrubSamples.filter(s => now - s.t <= 120);
                    if (recent.length >= 2) {
                        const first = recent[0], last = recent[recent.length - 1];
                        const dt = last.t - first.t;
                        if (dt > 0) {
                            const vx = (last.x - first.x) / dt; // px per ms
                            const velocity = -vx * 1000; // px per second in scrubPos space
                            if (Math.abs(velocity) >= 150) {
                                momentumStarted = true;
                                this.startScrubMomentum(scrubPos, velocity);
                            }
                        }
                    }
                }
                if (!momentumStarted) {
                    if (this.core && typeof this.core.finishScrubbing === 'function') {
                        this.core.finishScrubbing();
                    }
                }
            }
        };
        
        square.addEventListener('pointerdown', (e) => {
            if (this.core.playback.isPlaying) return; 
            e.preventDefault(); 
            
            this.cancelScrubMomentum();
            longPressed = false; 
            isDraggingFrame = false; 
            hasScrolled = false; 
            startX = e.clientX; 
            startY = e.clientY;
            scrubSamples = [{ t: performance.now(), x: e.clientX }];
            scrubStartScroll = this.getFrameX(this.core.doc.currentFrameIndex);
            scrubPos = scrubStartScroll;
            
            try { square.setPointerCapture(e.pointerId); } catch(err) {}
            
            frameDragTimer = setTimeout(() => { 
                longPressed = true; if (navigator.vibrate) navigator.vibrate(40); 
                square.style.transform = 'scale(1.15)'; 
            }, window.longPressTimer || 400);
            
            square.addEventListener('pointermove', onMove); 
            square.addEventListener('pointerup', onUp); 
            square.addEventListener('pointercancel', onUp);
        });
        return square;
    }

    setTimelineExpansionLevel(level, init = false) {
        this.timelineLevel = level;
        if (!init) localStorage.setItem('timelineLevel', level);
        
        const footer = document.getElementById('timelineFooter');
        const container = document.getElementById('timelineContainer');
        const controls = document.getElementById('timelineControls');
        
        if (footer && container) {
            const extra = (level - 1) * 57;
            footer.style.height = `${85 + extra}px`;
            container.style.height = `${85 + extra}px`;
            if (controls) controls.style.height = `${85 + extra}px`;
        }
    }

    updateFrameNumbers() {
        const bar = document.getElementById('frameNumberBar');
        const row = document.getElementById('frameNumberRow');
        const container = document.getElementById('timelineContainer');
        const strip = document.getElementById('timelineStrip');
        if (!bar || !row || !container || !strip || !this.core.doc) return;

        // Cover the strip area plus its right margin, flush with the dark side blocks
        bar.style.left = container.offsetLeft + 'px';
        bar.style.width = (container.offsetWidth + 10) + 'px';

        const count = this.core.doc.frames.length;
        while (row.children.length < count) {
            const n = document.createElement('div');
            n.className = 'frame-number';
            row.appendChild(n);
        }
        while (row.children.length > count) row.removeChild(row.lastChild);
        for (let i = 0; i < count; i++) {
            const n = row.children[i];
            n.style.left = (8 + i * 61) + 'px'; // strip padding-left + frame pitch
            const txt = String(i + 1);
            if (n.textContent !== txt) n.textContent = txt;
            n.classList.toggle('active', i === this.core.doc.currentFrameIndex);
        }

        if (!strip.dataset.numbersInit) {
            strip.dataset.numbersInit = 'true';
            strip.addEventListener('scroll', () => this.syncFrameNumberScroll());
            window.addEventListener('resize', () => this.updateFrameNumbers());
        }
        this.syncFrameNumberScroll();
    }

    syncFrameNumberScroll() {
        const row = document.getElementById('frameNumberRow');
        const strip = document.getElementById('timelineStrip');
        if (row && strip) row.style.transform = `translateX(${-strip.scrollLeft}px)`;
    }

    updateActiveFrameOnly() {
        if (!this.core.doc) return;
        const curIdx = this.core.doc.currentFrameIndex;
        const prevIdx = this._lastActiveFrameIndex;
        if (curIdx === prevIdx) return;
        this._lastActiveFrameIndex = curIdx;

        const strip = this._timelineStrip || (this._timelineStrip = document.getElementById('timelineStrip'));
        if (!strip) return;

        const squares = strip.children;
        if (prevIdx !== undefined && prevIdx >= 0 && prevIdx < squares.length) {
            const prevSq = squares[prevIdx];
            if (prevSq && prevSq.classList.contains('frame-square')) {
                prevSq.classList.remove('active');
                prevSq.style.zIndex = '';
            }
        }
        if (curIdx >= 0 && curIdx < squares.length) {
            const curSq = squares[curIdx];
            if (curSq && curSq.classList.contains('frame-square')) {
                curSq.classList.add('active');
                curSq.style.zIndex = '25';
            }
        }

        const row = this._frameNumberRow || (this._frameNumberRow = document.getElementById('frameNumberRow'));
        if (row && row.children) {
            const nums = row.children;
            if (prevIdx !== undefined && prevIdx >= 0 && prevIdx < nums.length) {
                nums[prevIdx].classList.remove('active');
            }
            if (curIdx >= 0 && curIdx < nums.length) {
                nums[curIdx].classList.add('active');
            }
        }
    }

    updateActiveThumbnailOnly() {
        if (!this.core.doc) return;
        const strip = document.getElementById('timelineStrip');
        if (!strip) return;
        const curIdx = this.core.doc.currentFrameIndex;
        const activeLayerIdx = this.core.doc.activeLayerIndex;
        const squares = strip.querySelectorAll('.frame-square');
        const square = squares[curIdx];
        if (!square) return;
        const containers = square.querySelectorAll('.layer-thumb-container');
        const container = containers[activeLayerIdx];
        if (!container) return;
        const thumbCanvas = container.querySelector('canvas');
        if (!thumbCanvas) return;

        const layer = this.core.doc.activeLayer;
        const thumbScale = Math.min(1, CANVAS_PERF.thumbMaxWidth / this.core.doc.width);
        const thumbW = Math.max(1, Math.round(this.core.doc.width * thumbScale));
        const thumbH = Math.max(1, Math.round(this.core.doc.height * thumbScale));

        if (thumbCanvas.width !== thumbW || thumbCanvas.height !== thumbH) {
            thumbCanvas.width = thumbW;
            thumbCanvas.height = thumbH;
            thumbCanvas._thumbKey = null;
        }

        const visible = !!(layer && layer.visible);
        const thumbKey = layer ? `${layer._id}|${layer._ver}|${layer.opacity}|${visible}` : 'none';
        if (thumbCanvas._thumbKey !== thumbKey) {
            thumbCanvas._thumbKey = thumbKey;
            const thumbCtx = thumbCanvas.getContext('2d'); 
            thumbCtx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
            
            if (visible && layer && layer.hasContent) {
                const src = layer._canvas || (layer.isDehydrated && this.core.renderer ? this.core.renderer.getDehydratedLayerCanvas(layer) : layer.canvas);
                if (src) {
                    thumbCtx.globalAlpha = layer.opacity;
                    if (thumbScale < 1) {
                        thumbCtx.imageSmoothingEnabled = true;
                        thumbCtx.imageSmoothingQuality = 'medium';
                    } else {
                        thumbCtx.imageSmoothingEnabled = false;
                    }
                    thumbCtx.drawImage(src, 0, 0, thumbW, thumbH);
                    thumbCtx.globalAlpha = 1.0;
                }
            }
        }
    }

    updateTimelineUI() {
        if (!this.core.doc) return;
        this._lastActiveFrameIndex = -1;
        const strip = document.getElementById('timelineStrip');
        this.updateFrameNumbers();
        
        const isIndexCovered = (layerIdx, targetIdx) => {
            for (let k = Math.min(targetIdx, this.core.doc.frames.length - 1); k >= 0; k--) {
                const layer = this.core.doc.frames[k].layers[layerIdx];
                if (!layer.isDeleted) {
                    return k + (layer.holdCount || 1) > targetIdx;
                }
            }
            return false;
        };
        
        let labelsCol = document.getElementById('layerLabelsCol') || document.querySelector('.layer-labels-column');
        if (!labelsCol) {
            labelsCol = document.createElement('div');
            labelsCol.className = 'layer-labels-column';
            labelsCol.id = 'layerLabelsCol';
            labelsCol.style.touchAction = 'none';
            const controls = document.getElementById('timelineControls');
            if (controls) controls.appendChild(labelsCol);
            else strip.insertBefore(labelsCol, strip.firstChild);
        }

        const oldStripLabels = strip.querySelector('.layer-labels-column');
        if (oldStripLabels) {
            strip.removeChild(oldStripLabels);
        }

        if (!labelsCol.dataset.eventsInit) {
            labelsCol.dataset.eventsInit = 'true';
            let isDraggingLabels = false;
            let startY = 0;
            let startScroll = 0;
            const container = document.getElementById('timelineContainer');
            labelsCol.addEventListener('pointerdown', (e) => {
                isDraggingLabels = true;
                startY = e.clientY;
                startScroll = container.scrollTop;
                try { labelsCol.setPointerCapture(e.pointerId); } catch(err) {}
                e.preventDefault();
            });
            labelsCol.addEventListener('pointermove', (e) => {
                if (!isDraggingLabels) return;
                const dy = e.clientY - startY;
                container.scrollTop = startScroll - dy;
                labelsCol.scrollTop = container.scrollTop;
            });
            const onUp = (e) => {
                if (isDraggingLabels) {
                    const dy = Math.abs(e.clientY - startY);
                    if (dy < 6) {
                        const targetLabel = e.target.closest('.layer-label');
                        if (targetLabel && targetLabel.parentElement === labelsCol) {
                            const idx = Array.from(labelsCol.children).indexOf(targetLabel);
                            if (idx >= 0) this.events.emit('core:selectLayer', idx);
                        }
                    }
                }
                isDraggingLabels = false;
                try { labelsCol.releasePointerCapture(e.pointerId); } catch(err) {}
            };
            labelsCol.addEventListener('pointerup', onUp);
            labelsCol.addEventListener('pointercancel', onUp);
            labelsCol.addEventListener('wheel', (e) => {
                container.scrollTop += e.deltaY;
                labelsCol.scrollTop = container.scrollTop;
                e.preventDefault();
            }, { passive: false });

            container.addEventListener('scroll', () => {
                labelsCol.scrollTop = container.scrollTop;
            });
        }
        
        if (!strip.dataset.scrollInit) {
            strip.dataset.scrollInit = 'true';
            let isDraggingStrip = false, startStripX = 0, startStripScroll = 0;
            strip.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.frame-square') || e.target.closest('.layer-labels-column') || e.target.closest('.add-frame-timeline-btn') || e.target.closest('.layer-hold-handle')) return;
                isDraggingStrip = true;
                startStripX = e.clientX;
                startStripScroll = strip.scrollLeft;
                try { strip.setPointerCapture(e.pointerId); } catch(err) {}
            });
            strip.addEventListener('pointermove', (e) => {
                if (!isDraggingStrip) return;
                const dx = e.clientX - startStripX;
                strip.scrollLeft = startStripScroll - dx;
            });
            const onStripUp = (e) => {
                isDraggingStrip = false;
                try { strip.releasePointerCapture(e.pointerId); } catch(err) {}
            };
            strip.addEventListener('pointerup', onStripUp);
            strip.addEventListener('pointercancel', onStripUp);
        }
        
        const layerCount = this.core.doc.activeFrame.layers.length;
        
        while (labelsCol.children.length < layerCount) {
            const lbl = document.createElement('div');
            lbl.className = 'layer-label';
            labelsCol.appendChild(lbl);
        }
        while (labelsCol.children.length > layerCount) {
            labelsCol.removeChild(labelsCol.lastChild);
        }
        
        for (let i = 0; i < layerCount; i++) {
            const layerObj = this.core.doc.activeFrame.layers[i];
            const lName = this.getLayerName(layerObj, i);
            const lbl = labelsCol.children[i];
            lbl.innerText = layerObj.locked ? `🔐${lName.substring(1)}` : lName;
            lbl.classList.toggle('active', i === this.core.doc.activeLayerIndex);
        }
        
        let frameSquares = Array.from(strip.children).filter(el => el.classList.contains('frame-square'));
        const addBtn = document.getElementById('addFrameTimelineBtn');
        
        while (frameSquares.length < this.core.doc.frames.length) {
            const newNode = this.createFrameNode();
            const addCol = strip.querySelector('.add-frame-column');
            if (addBtn) strip.insertBefore(newNode, addBtn);
            else if (addCol) strip.insertBefore(newNode, addCol);
            else strip.appendChild(newNode);
            frameSquares.push(newNode);
        }
        while (frameSquares.length > this.core.doc.frames.length) {
            const last = frameSquares.pop();
            strip.removeChild(last);
        }
        
        this.core.doc.frames.forEach((frame, idx) => {
            const square = frameSquares[idx];
            
            square.dataset.frameIndex = idx; 
            const isFrameActive = idx === this.core.doc.currentFrameIndex;
            square.classList.toggle('active', isFrameActive);
            square.style.zIndex = isFrameActive ? '25' : '';
            
            square.style.width = '53px';
            square.style.height = (layerCount * 57 - 4) + 'px'; // 53px + 4px gap per layer
            
            let thumbContainers = Array.from(square.children).filter(el => el.classList.contains('layer-thumb-container'));
            while (thumbContainers.length < layerCount) {
                const c = document.createElement('div');
                c.className = 'layer-thumb-container';
                c.style.position = 'absolute';
                c.addEventListener('pointerdown', () => {
                    this.events.emit('core:selectLayer', parseInt(c.dataset.layerIndex, 10));
                });
                const cnv = document.createElement('canvas');
                c.appendChild(cnv);
                square.appendChild(c);
                thumbContainers.push(c);
            }
            while (thumbContainers.length > layerCount) {
                const last = thumbContainers.pop();
                square.removeChild(last);
            }
            
            for (let i = 0; i < layerCount; i++) {
                const container = thumbContainers[i];
                container.dataset.layerIndex = i;
                if (container.parentNode !== square) square.appendChild(container); // already in DOM order otherwise
                
                const layer = frame.layers[i];
                const lHCount = layer.holdCount || 1;
                
                const targetWContainer = (53 * lHCount + 8 * (lHCount - 1));
                container.style.width = targetWContainer + 'px';
                container.style.position = 'absolute';
                container.style.top = (i * 57) + 'px';
                container.style.left = '0';
                const isCurrentActiveLayer = (isFrameActive && i === this.core.doc.activeLayerIndex);
                container.classList.toggle('active', isCurrentActiveLayer);
                container.style.zIndex = isCurrentActiveLayer ? '30' : (lHCount > 1 ? '5' : '1');
                
                // Clear any existing plus buttons in this container
                let existingPlus = container.querySelector('.add-frame-timeline-btn');
                if (existingPlus) container.removeChild(existingPlus);
                
                let holdHandle = container.querySelector('.layer-hold-handle');
                const thumbCanvas = container.querySelector('canvas');
                
                if (layer && layer.isDeleted) {
                    thumbCanvas.style.display = 'none';
                    if (holdHandle) holdHandle.style.display = 'none';
                    container.style.background = 'transparent';
                    container.style.border = 'none';
                    container.style.pointerEvents = 'none';
                    
                    // Is this the first empty cell after a hold?
                    const currentlyCovered = isIndexCovered(i, idx);
                    if (!currentlyCovered) {
                        const prevCovered = idx > 0 ? isIndexCovered(i, idx - 1) : false;
                        if (prevCovered || idx === 0) {
                        const addBtn = document.createElement('button');
                        addBtn.className = 'add-frame-timeline-btn stop-propagation';
                        addBtn.title = 'Add Frame';
                        addBtn.innerText = '➕';
                        addBtn.style.pointerEvents = 'auto';
                        addBtn.dataset.layerAddBtn = i;
                        this.bindAddFrameButton(addBtn, i);
                        container.appendChild(addBtn);
                        }
                    }
                    continue; // Skip the rest of the drawing for deleted layers
                } else {
                    thumbCanvas.style.display = 'block';
                    container.style.background = '';
                    container.style.border = '';
                    container.style.pointerEvents = 'auto';
                }
                
                if (!holdHandle) {
                    holdHandle = document.createElement('div');
                    holdHandle.className = 'layer-hold-handle';
                    container.appendChild(holdHandle);
                    
                    let isDraggingHold = false, holdStartX, startHoldCount;

                    holdHandle.addEventListener('pointerdown', (e) => {
                        if (this.core.playback.isPlaying || this.core.state.isSpriteSheetView) return;
                        e.stopPropagation();
                        e.preventDefault();
                        holdStartX = e.clientX;
                        const currentIndex = parseInt(square.dataset.frameIndex, 10);
                        startHoldCount = this.core.doc.frames[currentIndex].layers[i].holdCount || 1;
                        isDraggingHold = true;
                        
                        if (navigator.vibrate) navigator.vibrate(40);
                        holdHandle.classList.add('dragging');
                        try { holdHandle.setPointerCapture(e.pointerId); } catch(err) {}
                        
                        const onHoldMove = (em) => {
                            if (!isDraggingHold) return;
                            const dx = em.clientX - holdStartX;
                            const addedHolds = Math.round(dx / 61); 
                            let newHold = Math.max(1, startHoldCount + addedHolds);
                            if (isNaN(newHold) || newHold < 1) newHold = 1;
                            
                            const lWidth = (53 * newHold + 8 * (newHold - 1));
                            container.style.width = lWidth + 'px';
                            
                            const addBtn = strip.querySelector(`[data-layer-add-btn="${i}"]`);
                            if (addBtn) {
                                const holdDiff = newHold - startHoldCount;
                                addBtn.style.transform = holdDiff !== 0 ? `translateX(${holdDiff * 61}px)` : 'none';
                            }
                        };
                        
                        const onHoldUp = (eu) => {
                            holdHandle.classList.remove('dragging');
                            try { holdHandle.releasePointerCapture(eu.pointerId); } catch(err) {}
                            
                            holdHandle.removeEventListener('pointermove', onHoldMove);
                            holdHandle.removeEventListener('pointerup', onHoldUp);
                            holdHandle.removeEventListener('pointercancel', onHoldUp);
                            
                            if (isDraggingHold) {
                                isDraggingHold = false;
                                const dx = eu.clientX - holdStartX;
                                const addedHolds = Math.round(dx / 61); 
                                let newHold = Math.max(1, startHoldCount + addedHolds);
                                
                                if (isNaN(newHold) || newHold < 1) newHold = 1;
                                
                                const currentHold = this.core.doc.frames[currentIndex].layers[i].holdCount || 1;
                                if (newHold !== currentHold) {
                                    const diff = newHold - currentHold;
                                    let safeDiff = diff;
                                    if (safeDiff < 0 && Math.abs(safeDiff) >= currentHold) {
                                        safeDiff = -(currentHold - 1);
                                    }
                                    
                                    if (safeDiff !== 0) {
                                        if (this.core.selection) this.core.selection.anchor();
                                        this.core.doc.frames[currentIndex].layers[i].holdCount = currentHold + safeDiff;
                                        if (safeDiff > 0) {
                                            this.core.doc.insertLayerFrameGap(i, currentIndex + 1, safeDiff);
                                        } else {
                                            for (let step = 0; step < -safeDiff; step++) {
                                                this.core.doc.deleteLayerFrame(i, currentIndex + 1);
                                            }
                                        }
                                        this.core.saveState();
                                    }
                                    this.updateTimelineUI(); 
                                } else {
                                    this.updateTimelineUI(); // reset visual width
                                }
                            }
                        };
                        
                        holdHandle.addEventListener('pointermove', onHoldMove);
                        holdHandle.addEventListener('pointerup', onHoldUp);
                        holdHandle.addEventListener('pointercancel', onHoldUp);
                    });
                }
                
                if (holdHandle) {
                    holdHandle.style.display = (i === this.core.doc.activeLayerIndex && idx === this.core.doc.currentFrameIndex) ? 'block' : 'none';
                }
                
                // Thumbnails are drawn at a small fixed size (not the full document resolution) and
                // only repainted when the layer's content/appearance actually changed.
                const thumbScale = Math.min(1, CANVAS_PERF.thumbMaxWidth / this.core.doc.width);
                const thumbW = Math.max(1, Math.round(this.core.doc.width * thumbScale));
                const thumbH = Math.max(1, Math.round(this.core.doc.height * thumbScale));
                if (thumbCanvas.width !== thumbW || thumbCanvas.height !== thumbH) {
                    thumbCanvas.width = thumbW;
                    thumbCanvas.height = thumbH;
                    thumbCanvas._thumbKey = null; // resizing clears the bitmap
                }
                
                thumbCanvas.style.width = '53px';
                thumbCanvas.style.height = '100%';
                thumbCanvas.style.objectFit = 'contain';
                thumbCanvas.style.objectPosition = 'left';
                
                const visible = !!(layer && layer.visible);
                const thumbKey = layer ? `${layer._id}|${layer._ver}|${layer.opacity}|${visible}` : 'none';
                if (thumbCanvas._thumbKey !== thumbKey) {
                    thumbCanvas._thumbKey = thumbKey;
                    const thumbCtx = thumbCanvas.getContext('2d'); 
                    thumbCtx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
                    
                    if (visible && layer && layer.hasContent) {
                        const src = layer._canvas || (layer.isDehydrated && this.core.renderer ? this.core.renderer.getDehydratedLayerCanvas(layer) : layer.canvas);
                        if (src) {
                            thumbCtx.globalAlpha = layer.opacity;
                            if (thumbScale < 1) {
                                thumbCtx.imageSmoothingEnabled = true;
                                thumbCtx.imageSmoothingQuality = 'medium';
                            } else {
                                thumbCtx.imageSmoothingEnabled = false;
                            }
                            thumbCtx.drawImage(src, 0, 0, thumbW, thumbH);
                            thumbCtx.globalAlpha = 1.0;
                        }
                    }
                }
            }
        });

        // Add the end column for plus buttons
        let addColumn = strip.querySelector('.add-frame-column');
        if (!addColumn) {
            addColumn = document.createElement('div');
            addColumn.className = 'add-frame-column';
            addColumn.style.display = 'flex';
            addColumn.style.flexDirection = 'column';
            addColumn.style.gap = '4px';
            addColumn.style.marginLeft = '8px';
            addColumn.style.marginRight = '20px';
            strip.appendChild(addColumn);
        } else {
            addColumn.style.gap = '4px';
            addColumn.style.marginRight = '20px';
            strip.appendChild(addColumn); // ensure it's at the end
        }

        let endSpacer = strip.querySelector('.timeline-end-spacer');
        if (!endSpacer) {
            endSpacer = document.createElement('div');
            endSpacer.className = 'timeline-end-spacer';
            endSpacer.style.cssText = 'width: 120px; min-width: 120px; height: 1px; flex-shrink: 0; pointer-events: none;';
            strip.appendChild(endSpacer);
        } else {
            endSpacer.style.cssText = 'width: 120px; min-width: 120px; height: 1px; flex-shrink: 0; pointer-events: none;';
            strip.appendChild(endSpacer); // always after addColumn
        }
        
        while (addColumn.children.length < layerCount) {
            const btnContainer = document.createElement('div');
            btnContainer.style.height = '53px';
            btnContainer.style.minHeight = '53px';
            btnContainer.style.width = '53px';
            btnContainer.style.flexShrink = '0';
            addColumn.appendChild(btnContainer);
        }
        while (addColumn.children.length > layerCount) {
            addColumn.removeChild(addColumn.lastChild);
        }
        
        for (let i = 0; i < layerCount; i++) {
            const btnContainer = addColumn.children[i];
            btnContainer.style.height = '53px';
            btnContainer.style.minHeight = '53px';
            btnContainer.style.width = '53px';
            btnContainer.style.flexShrink = '0';
            btnContainer.innerHTML = ''; // clear
            
            const docLength = this.core.doc.frames.length;
            const lastCovered = docLength > 0 ? isIndexCovered(i, docLength - 1) : false;
            const nextCovered = isIndexCovered(i, docLength);
            
            // Show plus button at the end only if the last frame was part of a hold and the hold doesn't extend beyond it
            if (!nextCovered && (lastCovered || docLength === 0)) {
                const addBtn = document.createElement('button');
                addBtn.className = 'add-frame-timeline-btn stop-propagation';
                addBtn.title = 'Add Frame';
                addBtn.innerText = '➕';
                        addBtn.dataset.layerAddBtn = i;
                this.bindAddFrameButton(addBtn, i);
                btnContainer.appendChild(addBtn);
            }
        }
    }

    bindAddFrameButton(addBtn, layerIdx) {
        let isTap = false, startX = 0, startY = 0, lastTriggerTime = 0;
        const trigger = (e) => {
            const now = Date.now();
            if (now - lastTriggerTime < 350) return;
            lastTriggerTime = now;
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
            this.events.emit('core:addLayerFrame', layerIdx);
        };

        addBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            isTap = true;
            startX = e.clientX;
            startY = e.clientY;
        });

        addBtn.addEventListener('pointermove', (e) => {
            if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
                isTap = false;
            }
        });

        addBtn.addEventListener('pointerup', (e) => {
            e.stopPropagation();
            if (isTap) {
                isTap = false;
                trigger(e);
            }
        });

        addBtn.addEventListener('pointercancel', () => {
            isTap = false;
        });

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            trigger(e);
        });
    }

    // scrubber removed

    updateBrushSizePreview(size) {
        const square = document.getElementById('brushSizeSquare');
        const metrics = this.core.viewport.getMetrics();
        const px = size * metrics.scaleX * this.core.viewport.scale;
        
        square.style.width = px + 'px'; 
        square.style.height = px + 'px';
        
        if (this.core.state.tool.brushShape === CONSTANTS.BRUSH_SHAPE.ROUND && (this.core.state.tool.current === CONSTANTS.TOOLS.PENCIL || this.core.state.tool.current === CONSTANTS.TOOLS.ERASER)) {
            square.style.borderRadius = '50%';
        } else {
            square.style.borderRadius = '0';
        }
    }

    showBrushSizePreview(size, toolName) {
        const indicator = document.getElementById('brushSizeIndicator');
        const square = document.getElementById('brushSizeSquare'); 
        
        indicator.style.display = 'flex';
        
        if (toolName === CONSTANTS.TOOLS.ERASER) { 
            square.style.backgroundColor = 'rgba(128, 128, 128, 0.5)'; 
            square.style.border = '1px solid #808080'; 
            square.style.outline = '1px solid #ffffff'; 
        } else { 
            square.style.backgroundColor = this.core.palette.currentColor; 
            square.style.border = '1px solid #ffffff'; 
            square.style.outline = '1px solid #000000'; 
        }
        
        this.updateBrushSizePreview(size);
    }

    makeShapeMenuDraggable() {
        const btns = document.querySelectorAll('#shapeMenu button');
        
        btns.forEach(btn => {
            let toolDragTimer, longPressed = false, isDraggingSize = false, startY, startSize, currentStickySize;
            
            btn.addEventListener('touchmove', (e) => { 
                if (longPressed) e.preventDefault(); 
            }, { passive: false });
            
            const onMove = (em) => {
                if (!longPressed) return;
                
                if (!isDraggingSize && Math.abs(em.clientY - startY) > 10) { 
                    isDraggingSize = true; 
                    startY = em.clientY; 
                    startSize = this.core.state.sizes[CONSTANTS.TOOLS.SHAPE]; 
                    currentStickySize = startSize; 
                }
                
                if (isDraggingSize) {
                    const maxSize = Math.max(this.core.bgCanvas.width, this.core.bgCanvas.height);
                    const currentDy = em.clientY - startY;
                    const pixelsPerStep = (window.innerHeight * 0.4) / Math.max(1, maxSize - 1); 
                    
                    let continuousSize = startSize - (currentDy / pixelsPerStep);
                    if (Math.abs(continuousSize - currentStickySize) >= 0.8) {
                        currentStickySize = Math.max(1, Math.min(maxSize, Math.round(continuousSize)));
                    }
                    
                    this.core.state.sizes[CONSTANTS.TOOLS.SHAPE] = currentStickySize; 
                    this.updateBrushSizePreview(currentStickySize); 
                    em.preventDefault();
                }
            };
            
            const onUp = (eu) => {
                clearTimeout(toolDragTimer); 
                btn.style.transform = '';
                try { btn.releasePointerCapture(eu.pointerId); } catch(err) {}
                
                btn.removeEventListener('pointermove', onMove); 
                btn.removeEventListener('pointerup', onUp);
                
                document.getElementById('brushSizeIndicator').style.display = 'none';
                this.core.state.tool.shape = btn.getAttribute('data-shape'); 
                document.getElementById('btn-shape').innerText = btn.innerText;
                
                this.closeAllMenus(); 
                this.events.emit('requestToolChange', this.core.state.tool.shape);
                isDraggingSize = false;
            };
            
            btn.addEventListener('pointerdown', (e) => {
                longPressed = false; 
                isDraggingSize = false; 
                startY = e.clientY;
                
                toolDragTimer = setTimeout(() => {
                    longPressed = true; if (navigator.vibrate) navigator.vibrate(40); 
                    btn.style.transform = 'scale(1.15)'; 
                    try { btn.setPointerCapture(e.pointerId); } catch(err) {}
                    
                    startSize = this.core.state.sizes[CONSTANTS.TOOLS.SHAPE]; 
                    currentStickySize = startSize; 
                    this.showBrushSizePreview(startSize, CONSTANTS.TOOLS.SHAPE);
                }, window.longPressTimer || 400);
                
                btn.addEventListener('pointermove', onMove); 
                btn.addEventListener('pointerup', onUp); 
                btn.addEventListener('pointercancel', onUp);
            });
        });
    }

    makeToolsDraggable() {
        const stack = document.getElementById('toolStack');
        const btns = Array.from(stack.querySelectorAll('.tool-btn'));
        
        btns.forEach(btn => {
            let toolDragTimer, longPressed = false, isDraggingTool = false, isDraggingSize = false, hasScrolled = false;
            let startX, startY, dragGhost = null, startSize = 1, currentStickySize = 1;
            
            btn.addEventListener('touchmove', (e) => { 
                if (longPressed) e.preventDefault(); 
            }, { passive: false });
            
            const onMove = (em) => {
                const currentToolName = btn.getAttribute('data-tool');
                const isSizeable = currentToolName === CONSTANTS.TOOLS.PENCIL || currentToolName === CONSTANTS.TOOLS.ERASER;
                const dx = em.clientX - startX;
                const dy = em.clientY - startY;
                
                if (!longPressed) { 
                    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { 
                        clearTimeout(toolDragTimer); 
                        hasScrolled = true; 
                    } 
                    return; 
                }
                
                if (!isDraggingTool && !isDraggingSize) {
                    if (isSizeable) {
                        if (Math.abs(dx) > 10) { 
                            isDraggingTool = true; 
                            document.getElementById('brushSizeIndicator').style.display = 'none'; 
                        } else if (Math.abs(dy) > 10) { 
                            isDraggingSize = true; 
                            startY = em.clientY; 
                            startSize = currentToolName === CONSTANTS.TOOLS.PENCIL ? this.core.state.sizes[CONSTANTS.TOOLS.PENCIL] : this.core.state.sizes[CONSTANTS.TOOLS.ERASER]; 
                            currentStickySize = startSize; 
                        }
                    } else {
                        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { 
                            isDraggingTool = true; 
                            if (currentToolName === CONSTANTS.TOOLS.SHAPE || currentToolName === CONSTANTS.TOOLS.WAND || currentToolName === CONSTANTS.TOOLS.MARQUEE || currentToolName === CONSTANTS.TOOLS.POLYGON || currentToolName === CONSTANTS.TOOLS.COLOR_SELECT || currentToolName === CONSTANTS.TOOLS.LASSO) {
                                this.closeAllMenus(); 
                            }
                        }
                    }
                    
                    if (isDraggingTool) {
                        dragGhost = btn.cloneNode(true); 
                        dragGhost.style.position = 'fixed'; 
                        dragGhost.style.opacity = '0.85'; 
                        dragGhost.style.pointerEvents = 'none'; 
                        dragGhost.style.zIndex = '1000';
                        dragGhost.style.width = '38px'; 
                        dragGhost.style.height = '38px'; 
                        dragGhost.classList.add('active'); 
                        document.body.appendChild(dragGhost); 
                        btn.style.opacity = '0.3';
                    }
                }
                
                if (isDraggingSize && isSizeable) {
                    const maxSize = Math.max(this.core.bgCanvas.width, this.core.bgCanvas.height);
                    const currentDy = em.clientY - startY;
                    const pixelsPerStep = (window.innerHeight * 0.4) / Math.max(1, maxSize - 1); 
                    let continuousSize = startSize - (currentDy / pixelsPerStep);
                    
                    if (Math.abs(continuousSize - currentStickySize) >= 0.8) {
                        currentStickySize = Math.max(1, Math.min(maxSize, Math.round(continuousSize)));
                    }
                    
                    if(currentToolName === CONSTANTS.TOOLS.PENCIL) this.core.state.sizes[CONSTANTS.TOOLS.PENCIL] = currentStickySize; 
                    if(currentToolName === CONSTANTS.TOOLS.ERASER) this.core.state.sizes[CONSTANTS.TOOLS.ERASER] = currentStickySize;
                    
                    this.updateBrushSizePreview(currentStickySize); 
                    em.preventDefault();
                }
                
                if (isDraggingTool && dragGhost) { 
                    dragGhost.style.left = (em.clientX - 19) + 'px'; 
                    dragGhost.style.top = (em.clientY - 19) + 'px'; 
                    em.preventDefault(); 
                }
            };
            
            const onUp = (eu) => {
                const currentToolName = btn.getAttribute('data-tool');
                clearTimeout(toolDragTimer); 
                btn.style.transform = ''; 
                btn.style.opacity = '1';
                
                try { btn.releasePointerCapture(eu.pointerId); } catch(err) {}
                
                btn.removeEventListener('pointermove', onMove); 
                btn.removeEventListener('pointerup', onUp); 
                btn.removeEventListener('pointercancel', onUp);
                
                if (isDraggingSize) {
                    isDraggingSize = false; 
                    document.getElementById('brushSizeIndicator').style.display = 'none';
                    
                } else if (isDraggingTool) {
                    isDraggingTool = false; 
                    if (dragGhost) { 
                        document.body.removeChild(dragGhost); 
                        dragGhost = null; 
                    }
                    
                    const stackRect = stack.getBoundingClientRect();
                    const relY = eu.clientY - stackRect.top + stack.scrollTop;
                    let dropIndex = Math.floor((relY + 23) / 46); 
                    
                    const currentBtns = Array.from(stack.querySelectorAll('.tool-btn')); 
                    dropIndex = Math.max(0, Math.min(currentBtns.length - 1, dropIndex));
                    const currentIndex = currentBtns.indexOf(btn);
                    
                    if (currentIndex !== dropIndex) { 
                        if (dropIndex >= currentBtns.length - 1) {
                            stack.appendChild(btn); 
                        } else if (dropIndex < currentIndex) {
                            stack.insertBefore(btn, currentBtns[dropIndex]); 
                        } else {
                            stack.insertBefore(btn, currentBtns[dropIndex + 1]); 
                        }
                    }
                } else if (!longPressed && !hasScrolled) {
                    if ([CONSTANTS.TOOLS.SHAPE, CONSTANTS.TOOLS.LINE, CONSTANTS.TOOLS.RECT, CONSTANTS.TOOLS.ELLIPSE].includes(currentToolName)) {
                        this.events.emit('requestToolChange', this.core.state.tool.shape, true); 
                    } else {
                        this.events.emit('requestToolChange', currentToolName, true);
                    }
                } else if (longPressed) {
                    if (currentToolName === CONSTANTS.TOOLS.PENCIL || currentToolName === CONSTANTS.TOOLS.ERASER) {
                        document.getElementById('brushSizeIndicator').style.display = 'none';
                        const sm = document.getElementById('brushShapeMenu');
                        const rect = btn.getBoundingClientRect();
                        sm.style.display = 'flex'; 
                        const smRect = sm.getBoundingClientRect();
                        let leftPos = rect.right + 10;
                        if (leftPos + smRect.width > window.innerWidth - 10) leftPos = rect.left - smRect.width - 10;
                        sm.style.left = leftPos + 'px'; 
                        let topPos = rect.top;
                        if (topPos + smRect.height > window.innerHeight - 10) topPos = window.innerHeight - smRect.height - 10;
                        sm.style.top = Math.max(10, topPos) + 'px';
                    }
                }
            };
            
            btn.addEventListener('pointerdown', (e) => {
                if (this.core.playback.isPlaying || this.core.state.isSpriteSheetView) return;
                
                longPressed = false; 
                isDraggingTool = false; 
                isDraggingSize = false; 
                hasScrolled = false; 
                startX = e.clientX; 
                startY = e.clientY;
                
                const currentToolName = btn.getAttribute('data-tool');
                const isSizeable = currentToolName === CONSTANTS.TOOLS.PENCIL || currentToolName === CONSTANTS.TOOLS.ERASER;
                
                toolDragTimer = setTimeout(() => {
                    longPressed = true; if (navigator.vibrate) navigator.vibrate(40); 
                    btn.style.transform = 'scale(1.15)'; 
                    try { btn.setPointerCapture(e.pointerId); } catch(err) {}
                    
                    if (isSizeable) { 
                        startSize = currentToolName === CONSTANTS.TOOLS.PENCIL ? this.core.state.sizes[CONSTANTS.TOOLS.PENCIL] : this.core.state.sizes[CONSTANTS.TOOLS.ERASER]; 
                        currentStickySize = startSize; 
                        this.showBrushSizePreview(startSize, currentToolName); 
                    } else if (currentToolName === CONSTANTS.TOOLS.SHAPE) { 
                        const sm = document.getElementById('shapeMenu');
                        const rect = btn.getBoundingClientRect(); 
                        sm.style.display = 'flex'; 
                        const smRect = sm.getBoundingClientRect();
                        let leftPos = rect.right + 10;
                        if (leftPos + smRect.width > window.innerWidth - 10) leftPos = rect.left - smRect.width - 10;
                        sm.style.left = leftPos + 'px'; 
                        let topPos = rect.top;
                        if (topPos + smRect.height > window.innerHeight - 10) topPos = window.innerHeight - smRect.height - 10;
                        sm.style.top = Math.max(10, topPos) + 'px'; 
                    } else if (currentToolName === CONSTANTS.TOOLS.WAND || currentToolName === CONSTANTS.TOOLS.MARQUEE || currentToolName === CONSTANTS.TOOLS.POLYGON || currentToolName === CONSTANTS.TOOLS.COLOR_SELECT || currentToolName === CONSTANTS.TOOLS.LASSO) { 
                        const sm = document.getElementById('selectMenu');
                        const rect = btn.getBoundingClientRect(); 
                        sm.style.display = 'flex'; 
                        const smRect = sm.getBoundingClientRect();
                        let leftPos = rect.right + 10;
                        if (leftPos + smRect.width > window.innerWidth - 10) leftPos = rect.left - smRect.width - 10;
                        sm.style.left = leftPos + 'px'; 
                        let topPos = rect.top;
                        if (topPos + smRect.height > window.innerHeight - 10) topPos = window.innerHeight - smRect.height - 10;
                        sm.style.top = Math.max(10, topPos) + 'px'; 
                    }
                }, window.longPressTimer || 400);
                
                btn.addEventListener('pointermove', onMove); 
                btn.addEventListener('pointerup', onUp); 
                btn.addEventListener('pointercancel', onUp);
            });
        });
    }
}




