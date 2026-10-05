import { denyOcrNetwork } from './ocr-network.js';
denyOcrNetwork();
require('tesseract.js/src/worker-script/node/index.js');
