// import { Injectable } from '@angular/core';
// import { ComputerVisionClient } from '@azure/cognitiveservices-computervision';
// import { ApiKeyCredentials } from '@azure/ms-rest-js';

// @Injectable({
//   providedIn: 'root'
// })
// export class AzureOcrService {

//   private client: ComputerVisionClient;

//   constructor() {
//     const key = '9uStgMEVw5O5ryMX2Y37jnDBkEVQZRJPOcfIaX5O3znjUXpHCDaVJQQJ99BIACi0881XJ3w3AAAFACOGhfx7';
//     const endpoint = 'https://computer-vision-dla.cognitiveservices.azure.com/';

//     this.client = new ComputerVisionClient(
//       new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': key } }),
//       endpoint
//     );
//   }

//   async analyzeImage(imageBase64: string) {
//     // Convert base64 to binary buffer
//     const binary = this.base64ToArrayBuffer(imageBase64);

//     const result = await this.client.recognizePrintedTextInStream(true, binary, { language: 'en' });
//     return result;
//   }

//   private base64ToArrayBuffer(base64: string): ArrayBuffer {
//     const binaryString = window.atob(base64.split(',')[1]);
//     const len = binaryString.length;
//     const bytes = new Uint8Array(len);
//     for (let i = 0; i < len; i++) {
//       bytes[i] = binaryString.charCodeAt(i);
//     }
//     return bytes.buffer;
//   }

// }

// azure-ocr.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AzureOcrService {
  private endpoint = environment.azure_endpoint;
  private apiKey = environment.azure_apiKey;

  constructor(private http: HttpClient) { }

  async readImage(dataUrl: string): Promise<any> {
    // Convert data URL to Blob
    const blob = this.dataURLtoBlob(dataUrl);

    // Send image to Read API
    const headers = new HttpHeaders({
      'Ocp-Apim-Subscription-Key': this.apiKey,
      'Content-Type': 'application/octet-stream'
    });

    const url = `${this.endpoint}vision/v3.2/read/analyze`;
    const response: any = await this.http.post(url, blob, { headers, observe: 'response' }).toPromise();

    // Get operation location URL
    const operationLocation = response.headers.get('operation-location');
    if (!operationLocation) throw new Error('No operation location returned from Azure.');

    // Poll until operation is completed
    let result: any = null;
    let status = 'running';
    while (status === 'running' || status === 'notStarted') {
      await this.sleep(1000); // wait 1 second
      result = await this.http.get(operationLocation, { headers }).toPromise();
      status = result['status'];
    }

    if (status !== 'succeeded') throw new Error('Azure OCR failed.');

    return result.analyzeResult;
  }

  private dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
