export const SEMANTIC_MODEL = {
  name: 'Multilingual E5 small', repository: 'intfloat/multilingual-e5-small',
  commit: '614241f622f53c4eeff9890bdc4f31cfecc418b3', dimensions: 384, maxTokens: 512,
  version: 'e5-small-int8-1/tokenizers-0.2.0/onnx-1.30.0',
  files: [
    { name: 'model.onnx', source: 'onnx/model_qint8_avx512_vnni.onnx', bytes: 118346824, sha256: 'dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88' },
    { name: 'tokenizer.json', source: 'onnx/tokenizer.json', bytes: 17082730, sha256: '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39' },
    { name: 'tokenizer_config.json', source: 'onnx/tokenizer_config.json', bytes: 443, sha256: 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b' },
    { name: 'config.json', source: 'onnx/config.json', bytes: 653, sha256: 'bbb7c1333fc4b3e27fbc9cd5d2070aabcc1d4dfb99917c3633e772f97545a6b6' },
    { name: 'LICENSE-E5.txt', source: 'https://raw.githubusercontent.com/microsoft/unilm/31c5b904ca1bf2afb4c234a6675c683a4e5fc7cd/LICENSE', bytes: 1104, sha256: '904dc4d8749877f1dba1cda48200d2462dccbeb7c134d5e4ef6fa75e0198c8fe' }
  ]
} as const;
export const MAX_SEMANTIC_CHUNKS = 30000;
