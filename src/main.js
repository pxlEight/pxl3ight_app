import PixelEditor from './PixelEditor.js?cb=171';

document.addEventListener('DOMContentLoaded', () => {
    window.defaultLongPressTimer = 500;
    const storedTimerV3 = localStorage.getItem("longPressTimer_v3");
    const storedTimerV2 = localStorage.getItem("longPressTimer_v2");
    let timerMs = window.defaultLongPressTimer;
    if (storedTimerV3 !== null) {
        let sec = parseFloat(storedTimerV3);
        if (!isNaN(sec) && sec >= 0.25 && sec <= 3.0) {
            timerMs = Math.round(Math.round(sec / 0.25) * 0.25 * 1000);
        }
    } else if (storedTimerV2 !== null) {
        let p = parseInt(storedTimerV2, 10);
        if (!isNaN(p)) {
            let sec = Math.max(0.25, Math.min(3.0, Math.round((p / 1000) / 0.25) * 0.25));
            timerMs = Math.round(sec * 1000);
        }
    }
    window.longPressTimer = timerMs;
    localStorage.setItem("longPressTimer_v3", (window.longPressTimer / 1000).toString());
    localStorage.setItem("longPressTimer_v2", window.longPressTimer);
    
    try {
        window.drawOffset = JSON.parse(localStorage.getItem('drawOffset_v1') || '{"x":0, "y":0}');
    } catch(e) {
        window.drawOffset = {x:0, y:0};
    }

    window.appCore = new PixelEditor(); 
    window.appCore.init();

    // Advanced workaround to trap the back button indefinitely
    window.history.pushState(null, null, window.location.href);
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', (event) => {
        window.history.forward();
    });

    // Prevent default context menu (long press on mobile)
    window.addEventListener("contextmenu", e => { e.preventDefault(); e.stopPropagation(); return false; }, { capture: true, passive: false });

    // Final safety net: show a confirmation dialog if they somehow manage to navigate away
    window.addEventListener('beforeunload', (event) => {
        event.preventDefault();
        event.returnValue = ''; // Trigger the browser's default exit warning
    });
});
