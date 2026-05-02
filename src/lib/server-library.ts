import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export type LibraryKind = "cifra" | "vs";

export type LibraryFile = {
  name: string;
  size: number;
  updatedAt: string;
  title: string;
  key?: string;
  bpm?: string;
};

const DEFAULT_ROOTS: Record<LibraryKind, string[]> = {
  cifra: [process.env.CIFRAS_DIR ?? "", "/data/cifras", path.join(process.cwd(), "cifras")],
  vs: [process.env.VS_DIR ?? "", "/data/vs", path.join(process.cwd(), "vs")]
};

const EXTENSIONS: Record<LibraryKind, string> = {
  cifra: ".pdf",
  vs: ".mp3"
};

const STANDALONE_KEY_PATTERN = /^[A-G](?:#|b)?m?$/i;
const TOM_KEY_PATTERN = /\bTOM\s*([A-G](?:#|b)?m?)\b/i;
const BPM_PATTERN = /(\d+(?:[.,]\d+)?)\s*BPM/i;

export function getLibraryRoot(kind: LibraryKind) {
  return DEFAULT_ROOTS[kind].find((root) => root && existsSync(root)) ?? DEFAULT_ROOTS[kind].at(-1) ?? "";
}

export function getLibraryStatus() {
  return (["cifra", "vs"] as const).map((kind) => {
    const root = getLibraryRoot(kind);
    const exists = Boolean(root && existsSync(root));
    const extension = EXTENSIONS[kind];
    const count = exists
      ? readdirSync(root, { withFileTypes: true }).filter(
          (entry) => !entry.name.startsWith(".") && entry.isFile() && entry.name.toLowerCase().endsWith(extension)
        ).length
      : 0;

    return {
      kind,
      root,
      exists,
      count,
      envVar: kind === "cifra" ? "CIFRAS_DIR" : "VS_DIR"
    };
  });
}

export function listLibraryFiles(kind: LibraryKind, query = "", limit = 80): LibraryFile[] {
  const root = getLibraryRoot(kind);
  if (!existsSync(root)) return [];

  const normalizedQuery = normalizeSearch(query);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(EXTENSIONS[kind]))
    .filter((entry) => !normalizedQuery || normalizeSearch(entry.name).includes(normalizedQuery))
    .slice(0, limit)
    .map((entry) => {
      const fullPath = path.join(root, entry.name);
      const stats = statSync(fullPath);
      return {
        name: entry.name,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        ...parseMusicFilename(entry.name)
      };
    });
}

export function resolveLibraryFile(kind: LibraryKind, name: string) {
  const root = getLibraryRoot(kind);
  const resolved = path.resolve(root, name);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Arquivo fora da biblioteca.");
  }

  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error("Arquivo nao encontrado.");
  }

  if (!resolved.toLowerCase().endsWith(EXTENSIONS[kind])) {
    throw new Error("Tipo de arquivo invalido.");
  }

  return resolved;
}

export function streamLibraryFile(kind: LibraryKind, name: string) {
  return createReadStream(resolveLibraryFile(kind, name));
}

export function parseMusicFilename(filename: string) {
  const base = filename.replace(/\.[^.]+$/, "");
  const bpm = base.match(BPM_PATTERN)?.[1]?.replace(",", ".");
  const tokens = base
    .split(/[_,-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const words = base.split(/\s+/).filter(Boolean);
  const trailingKey = words.length > 1 && STANDALONE_KEY_PATTERN.test(words.at(-1) ?? "") ? words.at(-1) : undefined;
  const key = base.match(TOM_KEY_PATTERN)?.[1] ?? tokens.find((token) => STANDALONE_KEY_PATTERN.test(token)) ?? trailingKey;
  const title = base
    .replace(BPM_PATTERN, "")
    .replace(TOM_KEY_PATTERN, "")
    .split(/[_,-]+/)
    .map((token) => token.trim())
    .filter((token) => token && token !== key && !BPM_PATTERN.test(token))
    .join(" ")
    .replace(key ? new RegExp(`\\s+${escapeRegExp(key)}$`, "i") : /$^/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    title: title || base,
    key,
    bpm
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
