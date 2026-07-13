export interface PanelSize { width: number; height: number; }
export function estimatePanelSize(questionText = '', optionLabels: string[] = []): PanelSize {
  const questionUnits = displayUnits(questionText);
  const longestOption = Math.max(0, ...optionLabels.map(displayUnits));
  const contentUnits = Math.max(questionUnits, longestOption);
  const width = contentUnits > 420 ? 560 : contentUnits > 220 ? 480 : contentUnits > 100 ? 400 : 360;
  const unitsPerLine = Math.max(32, Math.floor((width - 64) / 8));
  const questionLines = questionText ? wrappedLines(questionText, unitsPerLine) : 0;
  const questionHeight = questionLines ? questionLines * 20 + 24 : 0;
  const optionsHeight = optionLabels.reduce((total, label) => total + Math.max(44, wrappedLines(label, unitsPerLine - 6) * 20 + 20), 0) + Math.max(0, optionLabels.length - 1) * 6;
  const height = questionText || optionLabels.length ? 290 + questionHeight + optionsHeight : 360;
  return { width, height: Math.max(360, height) };
}
function wrappedLines(text: string, unitsPerLine: number): number { return text.split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(displayUnits(line) / unitsPerLine)), 0); }
function displayUnits(text: string): number { return [...text].reduce((total, character) => total + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0); }
