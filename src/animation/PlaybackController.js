export default class PlaybackController {
    constructor(core) { 
        this.core = core; 
        this.isPlaying = false; 
        this.playInterval = null; 
        this.onionSkinEnabled = false; 
        this.fps = 12;
        this.loopMode = 'on'; // 'on', 'off', 'pingpong'
        this.playDirection = 1;
        this.onionFramesBefore = 1;
        this.onionFramesAfter = 1;
        this.currentHoldTick = 0;
        
        this.core.events.on('updateOnionSkin', () => this.updateOnionSkin()); 
    }
    togglePlay() {
        if (!this.core.doc || this.core.state.isSpriteSheetView) return;
        this.isPlaying = !this.isPlaying; 
        this.core.events.emit('ui:playbackChanged', this.isPlaying);
        
        if (this.isPlaying) {
            this.core.onionCanvas.style.display = 'none'; 
            this.playDirection = 1;
            this.currentHoldTick = 0;
            
            this._startPlaybackLoop();
        } else { 
            this._stopPlaybackLoop();
            this.updateOnionSkin(); 
        }
    }
    _startPlaybackLoop() {
        this._stopPlaybackLoop();
        this.playInterval = setInterval(() => {
            const currentFrame = this.core.doc.frames[this.core.doc.currentFrameIndex];
            const hCount = currentFrame.holdCount || 1;
            
            if (this.currentHoldTick < hCount - 1) {
                this.currentHoldTick++;
                return;
            }
            
            this.currentHoldTick = 0;
            
            let nextIndex = this.core.doc.currentFrameIndex + this.playDirection;
            const len = this.core.doc.frames.length;
            
            if (this.loopMode === 'on') {
                nextIndex = (nextIndex + len) % len;
            } else if (this.loopMode === 'pingpong') {
                if (nextIndex >= len) {
                    this.playDirection = -1;
                    nextIndex = len - 2;
                    if (nextIndex < 0) nextIndex = 0;
                } else if (nextIndex < 0) {
                    this.playDirection = 1;
                    nextIndex = 1;
                    if (nextIndex >= len) nextIndex = 0;
                }
            } else if (this.loopMode === 'off') {
                if (nextIndex >= len) {
                    this.togglePlay();
                    return;
                }
            }

            this.core.events.emit('core:switchFrame', nextIndex);
        }, 1000 / this.fps);
    }
    _stopPlaybackLoop() {
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }
    setFPS(fps) {
        this.fps = Math.max(1, Math.min(30, fps));
        if (this.isPlaying) {
            this._startPlaybackLoop();
        }
    }
    setLoopMode(mode) {
        this.loopMode = mode;
    }
    toggleOnionSkin() {
        this.onionSkinEnabled = !this.onionSkinEnabled; 
        this.core.events.emit('ui:onionSkinToggled', this.onionSkinEnabled);
        this.core.onionCanvas.style.display = (this.onionSkinEnabled && !this.core.state.isSpriteSheetView) ? 'block' : 'none';
        this.updateOnionSkin();
    }
    updateOnionSkin() {
        if (!this.core.doc || !this.onionSkinEnabled || this.core.state.isSpriteSheetView) { 
            this.core.onionCanvas.style.display = 'none'; 
            return; 
        }
        
        // If there are no frames to show, hide the canvas (unless we are just on frame 0 and have framesAfter)
        const curIdx = this.core.doc.currentFrameIndex;
        if (this.onionFramesBefore === 0 && this.onionFramesAfter === 0) {
             this.core.onionCanvas.style.display = 'none'; 
             return;
        }

        this.core.onionCanvas.style.display = 'block';
        if (this.core.onionCanvas.width !== this.core.doc.width) this.core.onionCanvas.width = this.core.doc.width; 
        if (this.core.onionCanvas.height !== this.core.doc.height) this.core.onionCanvas.height = this.core.doc.height;
        
        this.core.onionCtx.clearRect(0, 0, this.core.onionCanvas.width, this.core.onionCanvas.height); 
        this.core.onionCtx.imageSmoothingEnabled = false;
        
        const frames = this.core.doc.frames;

        // Draw frames before (older frames) -> draw them first so they are under, or maybe it doesn't matter much.
        // Actually, the prompt doesn't specify z-order, but let's draw them.
        for (let i = this.onionFramesBefore; i >= 1; i--) {
            let fIdx = curIdx - i;
            if (fIdx < 0) continue;
            let alpha = Math.max(0, 1.0 - 0.15 * (i - 1));
            this._drawFrameToOnion(frames[fIdx], alpha, '#ff0000');
        }

        for (let i = this.onionFramesAfter; i >= 1; i--) {
            let fIdx = curIdx + i;
            if (fIdx >= frames.length) continue;
            let alpha = Math.max(0, 1.0 - 0.15 * (i - 1));
            this._drawFrameToOnion(frames[fIdx], alpha, '#00ff00');
        }
    }
    
    _drawFrameToOnion(frame, baseAlpha, tint = null) {
        if (!tint) {
            frame.layers.forEach(l => { 
                if (l.visible) { 
                    this.core.onionCtx.globalAlpha = l.opacity * baseAlpha; 
                    this.core.onionCtx.drawImage(l.canvas, 0, 0); 
                } 
            }); 
        } else {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.core.doc.width;
            tempCanvas.height = this.core.doc.height;
            const tCtx = tempCanvas.getContext('2d');
            
            frame.layers.forEach(l => { 
                if (l.visible) { 
                    tCtx.globalAlpha = l.opacity; 
                    tCtx.drawImage(l.canvas, 0, 0); 
                } 
            });
            
            tCtx.globalCompositeOperation = 'source-in';
            tCtx.fillStyle = tint;
            tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            this.core.onionCtx.globalAlpha = baseAlpha;
            this.core.onionCtx.drawImage(tempCanvas, 0, 0);
        }
        this.core.onionCtx.globalAlpha = 1.0; 
    }
}
