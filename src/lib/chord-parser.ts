export type ParsedLine = {
  chords: string;
  lyrics: string;
};

export type SongSection = {
  title: string;
  lines: string[];
};

type ChordToken = {
  chord: string;
  index: number;
};

const SECTION_ALIASES: Array<[RegExp, string]> = [
  [/^\s*(intro|introducao|introdução)\s*(\d+)?\s*:?$/i, "Introdução"],
  [/^\s*(verso|estrofe)\s*(\d+)?\s*:?$/i, "Verso"],
  [/^\s*(pre[-\s]?refrao|pré[-\s]?refrão|pre[-\s]?coro)\s*(\d+)?\s*:?$/i, "Pré-refrão"],
  [/^\s*(refrao|refrão|coro)\s*(\d+)?\s*:?$/i, "Coro"],
  [/^\s*(instrumental|interludio|interlúdio)\s*(\d+)?\s*:?$/i, "Instrumental"],
  [/^\s*(solo)\s*(\d+)?\s*:?$/i, "Solo"],
  [/^\s*(ponte|bridge)\s*(\d+)?\s*:?$/i, "Ponte"],
  [/^\s*(final|fim|ending)\s*(\d+)?\s*:?$/i, "Final"]
];
const CHORD_TOKEN_PATTERN =
  /[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?[0-9A-Za-zº°+#()\-]*(?:\/[A-G](?:#|b)?[0-9A-Za-zº°+#()\-]*)?/g;

export function convertBracketLine(line: string): ParsedLine {
  let chordLine = "";
  let lyricLine = "";
  let lyricIndex = 0;
  let cursor = 0;
  const chordPattern = /\[([^\]\n]+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = chordPattern.exec(line)) !== null) {
    const before = line.slice(cursor, match.index);
    lyricLine += before;
    lyricIndex += before.length;

    const chord = match[1].trim();
    if (chordLine.length < lyricIndex) {
      chordLine = chordLine.padEnd(lyricIndex, " ");
    }
    chordLine += chord;
    lyricIndex += 0;
    cursor = match.index + match[0].length;
  }

  const tail = line.slice(cursor);
  lyricLine += tail;

  return {
    chords: chordLine.trimEnd(),
    lyrics: lyricLine
  };
}

export function formatBracketChords(text: string) {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      if (!line.includes("[")) return [line];
      const parsed = convertBracketLine(line);
      return parsed.chords ? [parsed.chords, parsed.lyrics] : [parsed.lyrics];
    })
    .join("\n");
}

export function convertChordLinesToBracketChords(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const converted: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!isStandaloneChordLine(line)) {
      converted.push(line);
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine && shouldAttachChordsToLine(nextLine)) {
      converted.push(attachChordsToLyricLine(line, nextLine));
      index += 1;
    } else {
      converted.push(chordLineToBracketLine(line));
    }
  }

  return converted.join("\n");
}

export function detectSectionTitle(line: string): string | null {
  for (const [pattern, title] of SECTION_ALIASES) {
    const match = line.match(pattern);
    if (match) {
      return match[2] ? `${title} ${match[2]}` : title;
    }
  }

  const bracketed = line.match(/^\s*\[([^\]]+)\]\s*$/);
  if (bracketed) {
    const normalized = detectSectionTitle(bracketed[1]);
    return normalized ?? bracketed[1];
  }

  return null;
}

export function organizeSections(text: string): SongSection[] {
  const lines = text.split(/\r?\n/);
  const sections: SongSection[] = [];
  let current: SongSection = { title: "Verso 1", lines: [] };
  const generatedCounts = new Map<string, number>();

  for (const line of lines) {
    const title = detectSectionTitle(line);
    if (title) {
      if (current.lines.some((value) => value.trim())) {
        sections.push(current);
        syncGeneratedSectionCount(current.title, generatedCounts);
      }
      current = { title: title.includes(" ") ? title : nextGeneratedSectionTitle(title, generatedCounts), lines: [] };
    } else {
      current.lines.push(line);
    }
  }

  if (current.lines.some((value) => value.trim())) sections.push(current);
  return sections.length ? sections : [{ title: "Verso 1", lines }];
}

export function buildSongGuide(sections: SongSection[]) {
  const titles = sections.map((section) => section.title.trim()).filter(Boolean);
  const counts = new Map<string, number>();

  for (const title of titles) {
    const baseTitle = getSectionBaseTitle(title);
    counts.set(baseTitle, (counts.get(baseTitle) ?? 0) + 1);
  }

  return {
    order: titles.join(" > "),
    quantities: [...counts.entries()].map(([title, count]) => `${title} ${count}x`).join(" | ")
  };
}

export function sectionsToText(sections: SongSection[]) {
  return sections
    .map((section) => [`[${section.title}]`, ...section.lines].join("\n").trimEnd())
    .join("\n\n");
}

export function compactRepeatedSections(sections: SongSection[]) {
  const seen = new Map<string, SongSection>();
  const result: SongSection[] = [];

  for (const section of sections) {
    const key = section.lines.join("\n").replace(/\s+/g, " ").trim().toLowerCase();
    if (key && seen.has(key)) {
      const first = seen.get(key);
      result.push({
        title: section.title,
        lines: [`[${first?.title ?? section.title} 2x]`]
      });
    } else {
      seen.set(key, section);
      result.push(section);
    }
  }

  return result;
}

export function buildFinalChart(params: {
  title: string;
  guide?: ReturnType<typeof buildSongGuide>;
  guideText?: string;
  originalKey: string;
  newKey: string;
  capo?: string;
  rhythm?: string;
  dynamics?: string;
  body: string;
}) {
  const header = [
    `Título: ${params.title || "Sem título"}`,
    `Tom: ${params.newKey}`,
    `Capo: ${params.capo || "Sem capo"}`,
    params.rhythm ? `Ritmo: ${params.rhythm}` : ""
  ].filter(Boolean);

  return `${header.join("\n")}\n\n${params.body}`.trim();
}

function nextGeneratedSectionTitle(title: string, generatedCounts: Map<string, number>) {
  const next = (generatedCounts.get(title) ?? 0) + 1;
  generatedCounts.set(title, next);

  return title === "Verso" ? `${title} ${next}` : title;
}

function getSectionBaseTitle(title: string) {
  return title.replace(/\s+\d+$/i, "").trim();
}

function syncGeneratedSectionCount(title: string, generatedCounts: Map<string, number>) {
  const match = title.match(/^(.*?)(?:\s+(\d+))?$/);
  const baseTitle = match?.[1]?.trim();
  const number = Number(match?.[2]);

  if (!baseTitle || !Number.isFinite(number)) return;
  generatedCounts.set(baseTitle, Math.max(generatedCounts.get(baseTitle) ?? 0, number));
}

function isStandaloneChordLine(line: string) {
  if (!line.trim() || line.includes("[") || detectSectionTitle(line)) return false;

  const tokens = getChordTokens(line);
  if (!tokens.length) return false;

  const residue = line
    .replace(CHORD_TOKEN_PATTERN, "")
    .replace(/[|:.,/()\-\s]/g, "");

  return residue.length === 0;
}

function shouldAttachChordsToLine(line: string) {
  return Boolean(line.trim() && !line.includes("[") && !isStandaloneChordLine(line) && !detectSectionTitle(line));
}

function attachChordsToLyricLine(chordLine: string, lyricLine: string) {
  const tokens = getChordTokens(chordLine);
  let result = lyricLine;

  for (const token of [...tokens].reverse()) {
    const column = Math.min(token.index, result.length);
    result = `${result.slice(0, column)}[${token.chord}]${result.slice(column)}`;
  }

  return result.replace(/\s+$/g, "");
}

function chordLineToBracketLine(line: string) {
  return line.replace(CHORD_TOKEN_PATTERN, (chord) => `[${chord}]`);
}

function getChordTokens(line: string) {
  const tokens: ChordToken[] = [];
  let match: RegExpExecArray | null;
  CHORD_TOKEN_PATTERN.lastIndex = 0;

  while ((match = CHORD_TOKEN_PATTERN.exec(line)) !== null) {
    tokens.push({
      chord: match[0],
      index: match.index
    });
  }

  return tokens;
}
