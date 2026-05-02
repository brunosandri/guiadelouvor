export type ParsedLine = {
  chords: string;
  lyrics: string;
};

export type SongSection = {
  title: string;
  lines: string[];
};

const SECTION_ALIASES: Array<[RegExp, string]> = [
  [/^\s*(intro|introducao|introdução)\s*:?$/i, "Intro"],
  [/^\s*(verso|estrofe)\s*(\d+)?\s*:?$/i, "Verso"],
  [/^\s*(pre[-\s]?refrao|pré[-\s]?refrão|pre[-\s]?coro)\s*:?$/i, "Pré-refrão"],
  [/^\s*(refrao|refrão|coro)\s*:?$/i, "Refrão"],
  [/^\s*(ponte|bridge)\s*:?$/i, "Ponte"],
  [/^\s*(interludio|interlúdio)\s*:?$/i, "Interlúdio"],
  [/^\s*(final|fim|ending)\s*:?$/i, "Final"]
];

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

export function detectSectionTitle(line: string): string | null {
  for (const [pattern, title] of SECTION_ALIASES) {
    const match = line.match(pattern);
    if (match) {
      if (title === "Verso" && match[2]) return `${title} ${match[2]}`;
      return title;
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
  let verseCount = 1;

  for (const line of lines) {
    const title = detectSectionTitle(line);
    if (title) {
      if (current.lines.some((value) => value.trim())) sections.push(current);
      const nextTitle = title === "Verso" ? `Verso ${++verseCount}` : title;
      current = { title: nextTitle, lines: [] };
    } else {
      current.lines.push(line);
    }
  }

  if (current.lines.some((value) => value.trim())) sections.push(current);
  return sections.length ? sections : [{ title: "Verso 1", lines }];
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
  originalKey: string;
  newKey: string;
  capo?: string;
  rhythm?: string;
  dynamics?: string;
  body: string;
}) {
  const header = [
    `Título: ${params.title || "Sem título"}`,
    `Tom original: ${params.originalKey}`,
    `Novo tom: ${params.newKey}`,
    `Capo: ${params.capo || "Sem capo"}`,
    `Ritmo sugerido: ${params.rhythm || "Não informado"}`,
    params.dynamics ? `Dinâmica:\n${params.dynamics}` : ""
  ].filter(Boolean);

  return `${header.join("\n")}\n\n${params.body}`.trim();
}
