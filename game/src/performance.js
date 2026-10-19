// Android WebView and phones use a lighter profile; desktop keeps its quality.
export const mobileGraphics = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia('(pointer: coarse)').matches;
