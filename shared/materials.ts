export const MATERIAL_EXTENSIONS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'html', 'htm', 'srt', 'vtt'];
export const MATERIAL_KINDS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'html', 'srt', 'vtt', 'note', 'ocr'] as const;
export function materialPartLabel(kind: string, index: number) {
  return `${kind === 'pptx' ? 'Diapositiva' : kind === 'srt' || kind === 'vtt' ? 'Sección de transcripción' : 'Página'} ${index + 1}`;
}
