import pdf from "pdf-parse";
import { convertChordLinesToBracketChords } from "@/lib/chord-parser";

type PdfTextItem = {
  str: string;
  width?: number;
  height?: number;
  transform?: number[];
};

type PdfPageData = {
  getTextContent: (options?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }) => Promise<{ items: PdfTextItem[] }>;
};

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const PAGE_BREAK = "\n\n";
const LINE_Y_TOLERANCE = 2.4;
const MAX_INSERTED_SPACES = 18;

const SECTION_PATTERN =
  /^\s*(?:intro|introducao|introdução|verso|estrofe|pre[-\s]?refrao|pré[-\s]?refrão|pre[-\s]?coro|refrao|refrão|coro|instrumental|solo|ponte|bridge|interludio|interlúdio|final|fim|ending)\s*\d*\s*:?\s*$/i;
const CHORD_LINE_PATTERN =
  /^\s*(?:[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?[\wº°+#/()\-]*(?:\s+|$)|[|:.,/()\-\s]){2,}$/i;

export async function extractPdfText(buffer: Buffer) {
  const parsed = await pdf(buffer, {
    pagerender: renderPdfPage
  });

  return convertChordLinesToBracketChords(normalizeExtractedPdfText(parsed.text));
}

async function renderPdfPage(pageData: PdfPageData) {
  const content = await pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false
  });

  const positioned = content.items
    .map(toPositionedText)
    .filter((item): item is PositionedText => Boolean(item?.text.trim()));

  return buildPageText(positioned);
}

function toPositionedText(item: PdfTextItem): PositionedText | null {
  const text = normalizePdfGlyphs(item.str);
  const transform = item.transform;

  if (!transform || transform.length < 6) return null;

  const width = Math.max(item.width ?? 0, estimateTextWidth(text, item.height));
  const height = Math.max(item.height ?? Math.abs(transform[3] ?? 0), 1);

  return {
    text,
    x: transform[4] ?? 0,
    y: transform[5] ?? 0,
    width,
    height
  };
}

function buildPageText(items: PositionedText[]) {
  const lines = groupTextByLine(items);
  return lines.map(buildLineText).join("\n");
}

function groupTextByLine(items: PositionedText[]) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedText[][] = [];

  for (const item of sorted) {
    const line = lines.find((candidate) => {
      const averageY = candidate.reduce((sum, value) => sum + value.y, 0) / candidate.length;
      const tolerance = Math.max(LINE_Y_TOLERANCE, item.height * 0.45);
      return Math.abs(averageY - item.y) <= tolerance;
    });

    if (line) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }

  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

function buildLineText(line: PositionedText[]) {
  let text = "";
  let previousEnd = line[0]?.x ?? 0;
  const averageCharWidth = getAverageCharWidth(line);

  for (const item of line) {
    const gap = item.x - previousEnd;
    if (text && gap > averageCharWidth * 0.7) {
      const spaces = Math.min(MAX_INSERTED_SPACES, Math.max(1, Math.round(gap / averageCharWidth)));
      text += " ".repeat(spaces);
    }

    text += item.text;
    previousEnd = Math.max(previousEnd, item.x + item.width);
  }

  return cleanupLine(text);
}

function getAverageCharWidth(line: PositionedText[]) {
  const widths = line
    .map((item) => item.width / Math.max(item.text.trim().length, 1))
    .filter((width) => Number.isFinite(width) && width > 0);

  if (!widths.length) return 4;

  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)] ?? 4;
}

function normalizeExtractedPdfText(text: string) {
  const pages = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((page) => page.split("\n").map(cleanupLine).filter(Boolean));

  const repeatedNoise = findRepeatedPageNoise(pages);
  const cleanedPages = pages
    .map((page) =>
      page
        .filter((line) => !repeatedNoise.has(normalizeNoiseLine(line)))
        .filter((line) => !isPageNumberLine(line))
    )
    .map(compactLines)
    .map((page) => page.join("\n").trim())
    .filter(Boolean);

  return cleanedPages.join(PAGE_BREAK).replace(/\n{3,}/g, "\n\n").trim();
}

function compactLines(lines: string[]) {
  const result: string[] = [];

  for (const line of lines) {
    const current = cleanupLine(line);
    const previous = result.at(-1);

    if (!current) continue;

    if (!previous) {
      result.push(current);
      continue;
    }

    if (shouldJoinWithPrevious(previous, current)) {
      result[result.length - 1] = `${previous.replace(/-\s*$/, "")}${current}`;
    } else {
      result.push(current);
    }
  }

  return result;
}

function shouldJoinWithPrevious(previous: string, current: string) {
  if (previous.endsWith("-")) return true;
  if (previous.includes("[") || current.includes("[")) return false;
  if (SECTION_PATTERN.test(previous) || SECTION_PATTERN.test(current)) return false;
  if (CHORD_LINE_PATTERN.test(previous) || CHORD_LINE_PATTERN.test(current)) return false;
  if (/[.!?:;)]$/.test(previous)) return false;
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9[]/.test(current)) return false;

  return previous.length < 72 && current.length < 72;
}

function findRepeatedPageNoise(pages: string[][]) {
  const counts = new Map<string, number>();

  for (const page of pages) {
    const candidates = [...page.slice(0, 2), ...page.slice(-2)];
    for (const line of candidates) {
      const normalized = normalizeNoiseLine(line);
      if (normalized.length >= 4) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  const minimumRepeats = Math.max(2, Math.ceil(pages.length * 0.6));
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= minimumRepeats)
      .map(([line]) => line)
  );
}

function isPageNumberLine(line: string) {
  return /^\s*(?:pag(?:ina)?\.?\s*)?\d+\s*(?:\/\s*\d+)?\s*$/i.test(line);
}

function normalizeNoiseLine(line: string) {
  return line
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanupLine(line: string) {
  return normalizePdfGlyphs(line)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, (spaces) => (spaces.length > 3 ? spaces : " "))
    .trimEnd();
}

function normalizePdfGlyphs(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/–|—/g, "-");
}

function estimateTextWidth(text: string, height = 0) {
  return text.length * Math.max(height * 0.45, 4);
}
