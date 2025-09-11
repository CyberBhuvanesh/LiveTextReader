import { Component, ElementRef, ViewChild } from '@angular/core';
import heic2any from 'heic2any';
import * as Tesseract from 'tesseract.js';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import Cropper from 'cropperjs';
import { CropperComponent } from 'angular-cropperjs'; import { createWorker } from 'tesseract.js';
import { AzureOcrService } from './azure-ocr.service';


@Component({
  selector: 'app-ocr',
  templateUrl: './ocr.component.html',
  styleUrls: ['./ocr.component.css']
})
export class OcrComponent {
  constructor(
    private sanitizer: DomSanitizer,
    private azureOcrService: AzureOcrService // ← inject it here
  ) { }

  @ViewChild('angularCropper') public angularCropper!: CropperComponent;
  @ViewChild('video', { static: false }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('processingCanvas', { static: false }) processingCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvas!: ElementRef<HTMLCanvasElement>;

  extractedText: string = '';
  words: any[] = [];   // ← flattened words
  isLoading: boolean = false;
  imageUrl: SafeUrl = '';
  cropper!: Cropper;
  selectedWord: any = null;
  popupPosition = { x: 0, y: 0 };

  ngAfterViewInit() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        const video = this.video.nativeElement;
        video.srcObject = stream;

        video.onloadedmetadata = () => {
          video.play();
          const overlay = this.overlayCanvas.nativeElement;
          const processing = this.processingCanvas.nativeElement;
          overlay.width = video.videoWidth;
          overlay.height = video.videoHeight;
          processing.width = video.videoWidth;
          processing.height = video.videoHeight;
        };
      })
      .catch(err => console.error('Camera error:', err));
  }

  photoCaptured = false;
  //old local
  // async capturePhoto() {
  //   const video = this.video.nativeElement;
  //   this.photoCaptured = true;

  //   const canvas = this.processingCanvas.nativeElement;
  //   const overlay = this.overlayCanvas.nativeElement;

  //   // Set canvas to video’s natural resolution
  //   canvas.width = video.videoWidth;
  //   canvas.height = video.videoHeight;

  //   overlay.width = video.videoWidth;
  //   overlay.height = video.videoHeight;

  //   const ctx = canvas.getContext('2d')!;
  //   ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  //   // Scale canvas to match video wrapper visually
  //   canvas.style.width = video.clientWidth + 'px';
  //   canvas.style.height = video.clientHeight + 'px';
  //   overlay.style.width = video.clientWidth + 'px';
  //   overlay.style.height = video.clientHeight + 'px';

  //   const dataUrl = canvas.toDataURL('image/jpeg');
  //   this.isLoading = true;

  //   const worker = await createWorker(['eng', 'jpn']);
  //   try {
  //     await worker.setParameters({ tessedit_create_tsv: '3' });
  //     const { data } = await worker.recognize(dataUrl, {}, { tsv: true });

  //     this.extractedText = data.text;
  //     if (data.tsv) {
  //       this.words = this.parseTSV(data.tsv);
  //       this.drawBoundingBoxes();
  //     } else {
  //       this.words = [];
  //       console.warn('TSV data not available');
  //     }
  //   } catch (err) {
  //     console.error('OCR error:', err);
  //   } finally {
  //     this.isLoading = false;
  //     await worker.terminate();
  //   }
  // }

  //old azure
  // async capturePhoto() {
  //   if (!this.video || !this.video.nativeElement) return;

  //   const video = this.video.nativeElement;
  //   const canvas = this.processingCanvas.nativeElement;
  //   const overlay = this.overlayCanvas.nativeElement;

  //   this.photoCaptured = true;

  //   // Set canvas to video’s natural resolution
  //   canvas.width = video.videoWidth;
  //   canvas.height = video.videoHeight;
  //   overlay.width = video.videoWidth;
  //   overlay.height = video.videoHeight;

  //   const ctx = canvas.getContext('2d')!;
  //   ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  //   // Optional: scale canvas visually to match wrapper
  //   canvas.style.width = video.clientWidth + 'px';
  //   canvas.style.height = video.clientHeight + 'px';
  //   overlay.style.width = video.clientWidth + 'px';
  //   overlay.style.height = video.clientHeight + 'px';

  //   const dataUrl = canvas.toDataURL('image/jpeg');

  //   this.isLoading = true;
  //   this.words = [];
  //   this.selectedWord = null;

  //   try {
  //     // Call Azure OCR service
  //     const result = await this.azureOcrService.analyzeImage(dataUrl);

  //     const regions = result.regions ?? [];
  //     for (const region of regions) {
  //       const lines = region.lines ?? [];
  //       for (const line of lines) {
  //         const words = line.words ?? [];
  //         for (const word of words) {
  //           if (!word.boundingBox) continue;

  //           const [x, y, w, h] = word.boundingBox.split(',').map(Number);
  //           this.words.push({
  //             text: word.text ?? '',
  //             bbox: { x0: x, y0: y, x1: x + w, y1: y + h },
  //             conf: 1
  //           });
  //         }
  //       }
  //     }

  //     // Combine text for extracted text preview
  //     this.extractedText = this.words.map(w => w.text).join(' ');

  //     // Draw bounding boxes
  //     this.drawBoundingBoxes();
  //   } catch (err) {
  //     console.error('Azure OCR error:', err);
  //   } finally {
  //     this.isLoading = false;
  //   }
  // }

  async capturePhoto() {
    const video = this.video.nativeElement;
    this.photoCaptured = true;

    const canvas = this.processingCanvas.nativeElement;
    const overlay = this.overlayCanvas.nativeElement;

    // Set canvas size to video’s resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Scale canvas to match video wrapper visually
    canvas.style.width = video.clientWidth + 'px';
    canvas.style.height = video.clientHeight + 'px';
    overlay.style.width = video.clientWidth + 'px';
    overlay.style.height = video.clientHeight + 'px';

    const dataUrl = canvas.toDataURL('image/jpeg');
    this.isLoading = true;

    try {
      interface AzureWord {
        boundingBox: number[];
        text: string;
      }

      interface AzureLine {
        words: AzureWord[];
      }

      interface AzurePage {
        lines: AzureLine[];
      }

      // Send image to Azure Read API
      const pollResult = await this.azureOcrService.readImage(dataUrl);

      // Flatten words for overlay
      this.words = [];
      (pollResult.readResults as AzurePage[]).forEach((page: AzurePage) => {
        page.lines.forEach((line: AzureLine) => {
          line.words.forEach((word: AzureWord) => {
            const [x, y, w, h] = word.boundingBox;
            this.words.push({
              text: word.text,
              bbox: { x0: x, y0: y, x1: x + w, y1: y + h },
              conf: 1
            });
          });
        });
      });

      // Combine all words for extracted text
      this.extractedText = this.words.map(w => w.text).join(' ');

      // Draw bounding boxes
      this.drawBoundingBoxes();
    } catch (err) {
      console.error('Azure Read API error:', err);
    } finally {
      this.isLoading = false;
    }
  }


  /** Handle clicks on overlay to select a word */
  onOverlayClick(event: MouseEvent) {
    if (!this.words || this.words.length === 0) return;

    const canvas = this.overlayCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const clickedWord = this.words.find(
      w => x >= w.bbox.x0 && x <= w.bbox.x1 && y >= w.bbox.y0 && y <= w.bbox.y1
    );

    if (clickedWord) {
      this.selectedWord = clickedWord;

      // Show popup inside image overlay
      this.popupPosition = {
        x: clickedWord.bbox.x0,
        y: clickedWord.bbox.y0 - 30 // offset above box
      };

      this.drawBoundingBoxes();
      this.highlightWord(clickedWord);
    }
  }

  /** Draw overlay boxes for all words */
  drawBoundingBoxes() {
    const canvas = this.overlayCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const word of this.words) {
      const { x0, y0, x1, y1 } = word.bbox;

      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  /** Highlight a single word with yellow overlay */
  highlightWord(word: any) {
    const canvas = this.overlayCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const { x0, y0, x1, y1 } = word.bbox;

    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }




  retakePhoto() {
    this.words = [];
    this.extractedText = '';
    this.photoCaptured = false;
    this.startCamera(); // 🔹 restart camera feed
  }
  private async startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = this.video.nativeElement;
      video.srcObject = stream;

      await video.play();
    } catch (err) {
      console.error('Camera error:', err);
    }
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
  // drawBoundingBoxes() {
  //   const canvas = this.overlayCanvas.nativeElement;
  //   const ctx = canvas.getContext('2d')!;
  //   ctx.clearRect(0, 0, canvas.width, canvas.height);

  //   for (const word of this.words) {
  //     const { x0, y0, x1, y1 } = word.bbox;
  //     const width = x1 - x0;
  //     const height = y1 - y0;

  //     // Create gradient border
  //     const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  //     gradient.addColorStop(0, '#ff4d4d'); // bright red
  //     gradient.addColorStop(1, '#ff9999'); // soft red

  //     ctx.strokeStyle = gradient;
  //     ctx.lineWidth = 2;

  //     // Glow effect
  //     ctx.shadowColor = 'rgba(255, 46, 46, 0.6)';
  //     ctx.shadowBlur = 6;

  //     // Rounded rectangle (fallback if roundRect not supported)
  //     // if (typeof ctx.roundRect === 'function') {
  //     //   ctx.beginPath();
  //     //   // ctx.roundRect(x0, y0, width, height, 6); // 6px corner radius
  //     //   ctx.stroke();
  //     // } else {
  //     this.drawRoundedRect(ctx, x0, y0, width, height, 6);
  //     // }

  //     // Reset shadow for next draw
  //     ctx.shadowBlur = 0;
  //   }
  // }
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
  // onOverlayClick(event: MouseEvent) {
  //   const canvas = this.overlayCanvas.nativeElement;
  //   const rect = canvas.getBoundingClientRect();
  //   const x = event.clientX - rect.left;
  //   const y = event.clientY - rect.top;

  //   const clickedWord = this.words.find(
  //     w => x >= w.bbox.x0 && x <= w.bbox.x1 && y >= w.bbox.y0 && y <= w.bbox.y1
  //   );

  //   if (clickedWord) {
  //     this.extractedText = clickedWord.text;
  //     navigator.clipboard.writeText(clickedWord.text).catch(() => { });
  //     console.log('Selected word:', clickedWord.text);

  //     this.highlightWord(clickedWord);

  //     // 🔹 Save selected word and popup position
  //     this.selectedWord = clickedWord;
  //     this.popupPosition = { x: clickedWord.bbox.x0, y: clickedWord.bbox.y0 - 30 }; // above the word
  //   }
  // }


  // /** Highlight a single word */
  // highlightWord(word: any) {
  //   this.drawBoundingBoxes(); // redraw all first
  //   const ctx = this.overlayCanvas.nativeElement.getContext('2d')!;
  //   ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
  //   const { x0, y0, x1, y1 } = word.bbox;
  //   ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // }
}
interface WordBox {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  conf: number;
}
