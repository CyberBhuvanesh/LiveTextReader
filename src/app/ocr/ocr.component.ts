import { Component, ElementRef, ViewChild } from '@angular/core';
import heic2any from 'heic2any';
import * as Tesseract from 'tesseract.js';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import Cropper from 'cropperjs';
import { CropperComponent } from 'angular-cropperjs'; import { createWorker } from 'tesseract.js';


@Component({
  selector: 'app-ocr',
  templateUrl: './ocr.component.html',
  styleUrls: ['./ocr.component.css']
})
export class OcrComponent {
  constructor(private sanitizer: DomSanitizer) { }

  @ViewChild('angularCropper') public angularCropper!: CropperComponent;
  @ViewChild('video', { static: false }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('processingCanvas', { static: false }) processingCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvas!: ElementRef<HTMLCanvasElement>;

  extractedText: string = '';
  words: any[] = [];   // ← flattened words
  isLoading: boolean = false;
  imageUrl: SafeUrl = '';
  cropper!: Cropper;

  ngAfterViewInit() {
    setInterval(() => {
      if (!this.isLoading) {
        this.captureFrameForOCR();
      }
    }, 3000);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        const video = this.video.nativeElement;
        video.srcObject = stream;

        video.onloadedmetadata = () => {
          video.play();
          setTimeout(() => {
            const overlay = this.overlayCanvas?.nativeElement;
            const processing = this.processingCanvas?.nativeElement;
            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
            processing.width = video.videoWidth;
            processing.height = video.videoHeight;

            this.startDrawingLoop(); // ← Start the drawing loop
          }, 0);
        };

      })
      .catch(err => console.error('Camera error:', err));
  }

  startDrawingLoop() {
    const draw = () => {
      if (this.words.length > 0) {
        this.drawBoundingBoxes();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }


  async captureFrameForOCR() {
    if (!this.video || !this.video.nativeElement) return;

    const video = this.video.nativeElement;
    const canvas = this.processingCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;

    // Draw video frame on canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg');

    this.isLoading = true;


    const worker = await createWorker(['eng', 'jpn']);

    try {

      await worker.setParameters({ tessedit_create_tsv: '3' });
      // Recognize the frame
      const { data } = await worker.recognize(dataUrl, {}, { tsv: true });

      // Extract plain text
      this.extractedText = data.text;

      // Parse TSV into word array with bbox
      if (data.tsv) {
        this.words = this.parseTSV(data.tsv);
        console.log('Parsed words:', this.words);
        this.drawBoundingBoxes(); // draw overlay rectangles
      } else {
        this.words = [];
        console.warn('TSV data not available');
      }

    } catch (err) {
      console.error('OCR error:', err);
    } finally {
      this.isLoading = false;
      await worker.terminate();
    }
  }

  /** Parse TSV output into array of words with bounding boxes */
  parseTSV(tsv: string) {
    const words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; conf: number }[] = [];
    const lines = tsv.split('\n');
    const headers = lines.shift()?.split('\t') || [];

    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length < 12) continue;
      const level = Number(cols[0]);
      if (level === 5) { // word level
        const left = Number(cols[6]);
        const top = Number(cols[7]);
        const width = Number(cols[8]);
        const height = Number(cols[9]);
        const text = cols[11];
        const conf = Number(cols[10]);
        if (text.trim()) {
          words.push({
            text,
            bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
            conf
          });
        }
      }
    }
    return words;
  }
  /** Flatten hierarchy into a single word list */
  flattenWords(data: any): any[] {
    const words: any[] = [];

    data.blocks?.forEach((block: any) => {
      block.paragraphs?.forEach((para: any) => {
        para.lines?.forEach((line: any) => {
          line.words?.forEach((word: any) => {
            words.push({
              text: word.text,
              bbox: word.bbox,
              confidence: word.confidence
            });
          });
        });
      });
    });

    return words;
  }

  // drawBoundingBoxes() {
  //   const canvas = this.overlayCanvas.nativeElement;
  //   const ctx = canvas.getContext('2d')!;
  //   ctx.clearRect(0, 0, canvas.width, canvas.height);

  //   ctx.strokeStyle = 'red';
  //   ctx.lineWidth = 2;

  //   for (const word of this.words) {
  //     const { x0, y0, x1, y1 } = word.bbox;
  //     ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  //   }
  // }
  drawBoundingBoxes() {
    const canvas = this.overlayCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const word of this.words) {
      const { x0, y0, x1, y1 } = word.bbox;
      const width = x1 - x0;
      const height = y1 - y0;

      // Create gradient border
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, '#ff4d4d'); // bright red
      gradient.addColorStop(1, '#ff9999'); // soft red

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;

      // Glow effect
      ctx.shadowColor = 'rgba(255, 46, 46, 0.6)';
      ctx.shadowBlur = 6;

      // Rounded rectangle (fallback if roundRect not supported)
      // if (typeof ctx.roundRect === 'function') {
      //   ctx.beginPath();
      //   // ctx.roundRect(x0, y0, width, height, 6); // 6px corner radius
      //   ctx.stroke();
      // } else {
      this.drawRoundedRect(ctx, x0, y0, width, height, 6);
      // }

      // Reset shadow for next draw
      ctx.shadowBlur = 0;
    }
  }
  drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.stroke();
  }


  /** Handle clicks on overlay */
  onOverlayClick(event: MouseEvent) {
    const canvas = this.overlayCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const clickedWord = this.words.find(
      w => x >= w.bbox.x0 && x <= w.bbox.x1 && y >= w.bbox.y0 && y <= w.bbox.y1
    );

    if (clickedWord) {
      this.extractedText = clickedWord.text;
      navigator.clipboard.writeText(clickedWord.text).catch(() => { });
      console.log('Selected word:', clickedWord.text);

      this.highlightWord(clickedWord);
    }
  }

  /** Highlight a single word */
  highlightWord(word: any) {
    this.drawBoundingBoxes(); // redraw all first
    const ctx = this.overlayCanvas.nativeElement.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
    const { x0, y0, x1, y1 } = word.bbox;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}
interface WordBox {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  conf: number;
}
