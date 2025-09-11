declare class OffscreenCanvas {
    constructor(width: number, height: number);
    getContext(contextId: '2d'): CanvasRenderingContext2D | null;
  }
  