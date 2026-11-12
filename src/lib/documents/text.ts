// Text helpers for PDF output. Standard PDF fonts only cover WinAnsi, so
// anything outside printable ASCII is folded or replaced before drawing.
// This module has no imports and is safe to unit test.

export function pdfSafe(input: string): string {
  const folded = input
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/\t/g, "    ")
    .replace(/\r\n?/g, "\n")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  return folded.replace(/[^\n\x20-\x7E]/g, "?");
}

// Greedy word wrap. widthOf measures a string at the chosen font and size.
// Words wider than the line are broken by character. Explicit newlines are
// kept as paragraph breaks.
export function wrapText(text: string, maxWidth: number, widthOf: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(text).split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (widthOf(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      let chunk = "";
      for (const ch of word) {
        if (widthOf(chunk + ch) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
    }
    lines.push(current);
  }
  return lines;
}
