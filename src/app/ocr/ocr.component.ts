import { Component, ElementRef, ViewChild } from '@angular/core';
import { SafeUrl } from '@angular/platform-browser';
import { AzureOcrService } from './azure-ocr.service';


@Component({
  selector: 'app-ocr',
  templateUrl: './ocr.component.html',
  styleUrls: ['./ocr.component.css']
})
export class OcrComponent {
  constructor(
    private azureOcrService: AzureOcrService // ← inject it here
  ) { }

  @ViewChild('video', { static: false }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('processingCanvas', { static: false }) processingCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvas!: ElementRef<HTMLCanvasElement>;

  extractedText: string = '';
  words: any[] = [];   // ← flattened words
  isLoading: boolean = false;
  imageUrl: SafeUrl = '';
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
            const bb = word.boundingBox; // bb = [x0,y0, x1,y1, x2,y2, x3,y3]

            const x0 = Math.min(bb[0], bb[2], bb[4], bb[6]);
            const y0 = Math.min(bb[1], bb[3], bb[5], bb[7]);
            const x1 = Math.max(bb[0], bb[2], bb[4], bb[6]);
            const y1 = Math.max(bb[1], bb[3], bb[5], bb[7]);

            this.words.push({
              text: word.text,
              bbox: { x0, y0, x1, y1 },
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

  drawBoundingBoxes() {
    const canvas = this.overlayCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const lines = this.groupWordsByLine(this.words);

    lines.forEach(lineWords => {
      const x0 = Math.min(...lineWords.map(w => w.bbox.x0));
      const y0 = Math.min(...lineWords.map(w => w.bbox.y0));
      const x1 = Math.max(...lineWords.map(w => w.bbox.x1));
      const y1 = Math.max(...lineWords.map(w => w.bbox.y1));

      ctx.fillStyle = 'rgba(255,255,0,0.3)';
      const radius = 6;

      ctx.beginPath();
      ctx.moveTo(x0 + radius, y0);
      ctx.lineTo(x1 - radius, y0);
      ctx.quadraticCurveTo(x1, y0, x1, y0 + radius);
      ctx.lineTo(x1, y1 - radius);
      ctx.quadraticCurveTo(x1, y1, x1 - radius, y1);
      ctx.lineTo(x0 + radius, y1);
      ctx.quadraticCurveTo(x0, y1, x0, y1 - radius);
      ctx.lineTo(x0, y0 + radius);
      ctx.quadraticCurveTo(x0, y0, x0 + radius, y0);
      ctx.closePath();
      ctx.fill();

      // highlight selected word individually
      if (this.selectedWord && lineWords.includes(this.selectedWord)) {
        const { x0: sx0, y0: sy0, x1: sx1, y1: sy1 } = this.selectedWord.bbox;
        ctx.fillStyle = 'rgba(255,165,0,0.5)';
        ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
      }
    });
  }
  groupWordsByLine(words: any[]) {
    const lines: any[][] = [];
    words.sort((a, b) => a.bbox.y0 - b.bbox.y0);

    let currentLine: any[] = [];
    let lastY = -1;
    const lineThreshold = 8; // pixels to decide same line

    words.forEach(word => {
      if (lastY === -1 || Math.abs(word.bbox.y0 - lastY) <= lineThreshold) {
        currentLine.push(word);
      } else {
        lines.push(currentLine);
        currentLine = [word];
      }
      lastY = word.bbox.y0;
    });

    if (currentLine.length) lines.push(currentLine);
    return lines;
  }

  onOverlayClick(event: MouseEvent) {
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
      this.popupPosition = { x: clickedWord.bbox.x0, y: clickedWord.bbox.y0 - 25 }; // popup above word
      this.extractedText = clickedWord.text;
      this.drawBoundingBoxes();
    }
  }

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
  flatWords(data: any): any[] {
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
}
