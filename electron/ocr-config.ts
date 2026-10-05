export const OCR_VERSION = 'tesseract.js-7.0.0/tessdata_fast-4.1.0';
export const OCR_ASSETS = [
  { name: 'spa.traineddata', bytes: 2294433, sha256: '6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464' },
  { name: 'glg.traineddata', bytes: 2554555, sha256: '7947619c5544d86849f563bd737ad90dbea9f5319fbd838c4747a7a1cd40b260' },
  { name: 'eng.traineddata', bytes: 4113088, sha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2' },
  { name: 'LICENSE', bytes: 11358, sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30' }
] as const;
export const OCR_COMMIT = '65727574dfcd264acbb0c3e07860e4e9e9b22185';
export const MAX_CAPTURE_BYTES = 2 * 1024 * 1024, MAX_CAPTURE_STORAGE = 24 * 1024 * 1024;
