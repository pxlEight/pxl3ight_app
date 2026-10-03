export default class UIDragInteraction {
    constructor(element, options) {
        this.element = element;
        this.options = options || {};
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.customData = {};
        
        if (!this.element) return;
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        
        this.element.addEventListener('pointerdown', this.onPointerDown);
    }
    
    onPointerDown(e) {
        if (this.options.stopPropagation) e.stopPropagation();
        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.customData = {};
        
        if (this.options.onDown) this.options.onDown(e, this);
        
        this.element.setPointerCapture(e.pointerId);
        this.element.addEventListener('pointermove', this.onPointerMove);
        this.element.addEventListener('pointerup', this.onPointerUp);
        this.element.addEventListener('pointercancel', this.onPointerUp);
    }
    
    onPointerMove(e) {
        if (!this.isDragging) return;
        if (this.options.preventDefaultOnMove) e.preventDefault();
        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;
        if (this.options.onDragMove) this.options.onDragMove(e, dx, dy, this);
    }
    
    onPointerUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.element.releasePointerCapture(e.pointerId);
        this.element.removeEventListener('pointermove', this.onPointerMove);
        this.element.removeEventListener('pointerup', this.onPointerUp);
        this.element.removeEventListener('pointercancel', this.onPointerUp);
        if (this.options.onDragEnd) this.options.onDragEnd(e, this);
    }
}
