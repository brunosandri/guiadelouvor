"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, ArrowLeft, Copy, Download,
  ExternalLink, FileText, Music2, Pencil,
  Printer, Save, Search, Trash2, Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildFinalChart, buildSongGuide, compactRepeatedSections,
  formatBracketChords, organizeSections, sectionsToText
} from "@/lib/chord-parser";
import type { SongSection } from "@/lib/chord-parser";
import {
  applyCapoShape, detectOriginalKey, KEY_OPTIONS,
  semitoneDistance, simplifyText, suggestCapo,
  transposeNoteToKey, transposeTextToKey
} from "@/lib/music";

const SAMPLE = `Intro
A [Am]palavra de Deus é gran[D]de

Verso 1
[C]Santo é o Senhor, [G/B]digno de louvor
[Am7]Meu coração se [F7M]rende a Ti

Refrão
[F]Aleluia, [C/E]aleluia
[Dm7]Tua igreja [G]canta a Ti`;

const RHYTHMS: Record<string, { pattern: string; dynamics: string }> = {
  "Balada simples": { pattern: "↓ ↓ ↑ ↑ ↓ ↑", dynamics: "Verso: leve\nRefrão: cheio\nPonte: crescendo" },
  "Pop congregacional": { pattern: "↓ ↑ ↓ ↑ ↓ ↑", dynamics: "Verso: marcado\nRefrão: aberto\nPonte: crescente" },
  "Worship lento": { pattern: "↓   ↓ ↑   ↑ ↓", dynamics: "Verso: suave\nRefrão: sustentado\nPonte: intenso" },
  "Batida 6/8": { pattern: "↓ ↓ ↑ ↓ ↑ ↓", dynamics: "Verso: fluido\nRefrão: amplo\nPonte: crescendo" },
  "Apenas marcação": { pattern: "↓   ↓   ↓   ↓", dynamics: "Verso: leve\nRefrão: firme\nPonte: livre" }
};

type AppView = "library" | "song" | "editor";

type LibraryFile = {
  name: string;
  size: number;
  updatedAt: string;
  title: string;
  key?: string;
  bpm?: string;
};

type InstrumentNotes = {
  bateria: string;
  violao: string;
  guitarra: string;
  baixo: string;
  vocal: string;
};

type ReferenceLink = { url: string; label: string };

type SongBlock = { id: string; title: string; notes: string; content: string };

type MemoryPdf = { id: string; name: string; text: string; savedAt: string };

type OpenedSong = {
  file: LibraryFile;
  chartText: string;
  instrumentNotes: InstrumentNotes;
  referenceLinks: ReferenceLink[];
  tracks: LibraryFile[];
};

const INSTRUMENTS: { key: keyof InstrumentNotes; label: string }[] = [
  { key: "bateria", label: "Bateria" },
  { key: "violao", label: "Violão" },
  { key: "guitarra", label: "Guitarra" },
  { key: "baixo", label: "Baixo" },
  { key: "vocal", label: "Vocal" }
];

const LABEL_TO_KEY: Record<string, keyof InstrumentNotes> = {
  Bateria: "bateria",
  "Violão": "violao",
  Guitarra: "guitarra",
  Baixo: "baixo",
  Vocal: "vocal"
};

const MEMORY_KEY = "cifra-igreja:pdf-memory";

function emptyInstrumentNotes(): InstrumentNotes {
  return { bateria: "", violao: "", guitarra: "", baixo: "", vocal: "" };
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function CifraApp() {
  const [appView, setAppView] = useState<AppView>("library");
  const [openedSong, setOpenedSong] = useState<OpenedSong | null>(null);

  // Library
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryResults, setLibraryResults] = useState<LibraryFile[]>([]);
  const [vsTracks, setVsTracks] = useState<LibraryFile[]>([]);
  const [libraryStatus, setLibraryStatus] = useState("");

  // Editor
  const [editorTab, setEditorTab] = useState("edicao");
  const [title, setTitle] = useState("Nova cifra");
  const [rawText, setRawText] = useState(SAMPLE);
  const [pdfStatus, setPdfStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [originalKey, setOriginalKey] = useState("C");
  const [newKey, setNewKey] = useState("D");
  const [quickTranspose, setQuickTranspose] = useState("custom");
  const [enableCapo, setEnableCapo] = useState(false);
  const [capoHouse, setCapoHouse] = useState("0");
  const [playedShape, setPlayedShape] = useState("G");
  const [simplify, setSimplify] = useState(false);
  const [compact, setCompact] = useState(false);
  const [addRhythm, setAddRhythm] = useState(true);
  const [rhythmType, setRhythmType] = useState("Balada simples");
  const [memoryPdfs, setMemoryPdfs] = useState<MemoryPdf[]>([]);
  const [referenceLinksText, setReferenceLinksText] = useState("");
  const [manualGuide, setManualGuide] = useState("");
  const [songBlocks, setSongBlocks] = useState<SongBlock[]>(() => createSongBlocksFromText(SAMPLE));
  const [layoutColumns, setLayoutColumns] = useState("1");
  const [instrumentNotes, setInstrumentNotes] = useState<InstrumentNotes>(emptyInstrumentNotes());

  const editedText = useMemo(() => songBlocksToText(songBlocks), [songBlocks]);
  const detectedKey = useMemo(() => detectOriginalKey(editedText || rawText), [editedText, rawText]);
  const librarySongs = useMemo(
    () => libraryResults.map((file) => ({ ...file, tracks: findRelatedTracks(file, vsTracks) })),
    [libraryResults, vsTracks]
  );
  const referenceLinks = useMemo(() => parseReferenceLinks(referenceLinksText), [referenceLinksText]);
  const detectedGuide = useMemo(() => buildSongGuide(songBlocksToSections(songBlocks)), [songBlocks]);

  useEffect(() => {
    setMemoryPdfs(readMemoryPdfs());
    void loadLibraryFiles("");
  }, []);

  const finalChart = useMemo(() => {
    const quick = quickTranspose === "custom" ? semitoneDistance(originalKey, newKey) : Number(quickTranspose);
    const capoHouseNumber = Number(capoHouse);
    const effectiveNewKey = transposeNoteToKey(originalKey, quick, newKey);
    const effectiveCapoHouse =
      Number.isFinite(capoHouseNumber) && capoHouseNumber > 0 ? capoHouseNumber : suggestCapo(originalKey, playedShape);
    const effectivePlayedShape = transposeNoteToKey(originalKey, -effectiveCapoHouse, playedShape);
    const semitones = quickTranspose === "custom" ? semitoneDistance(originalKey, newKey) : quick;
    let workingText = editedText || rawText;

    if (enableCapo) {
      workingText = applyCapoShape(workingText, originalKey, playedShape, effectiveCapoHouse);
    } else {
      workingText = transposeTextToKey(workingText, semitones, effectiveNewKey);
    }
    if (simplify) workingText = simplifyText(workingText);

    let sections = organizeSections(workingText);
    const guide = buildSongGuide(sections);
    if (compact) sections = compactRepeatedSections(sections);

    const body = formatBracketChords(sectionsToText(sections));
    const rhythm = addRhythm ? `${rhythmType}\n${RHYTHMS[rhythmType].pattern}` : "";
    const dynamics = addRhythm ? RHYTHMS[rhythmType].dynamics : "";
    const capo = enableCapo ? `${effectiveCapoHouse}ª casa, tocar como ${effectivePlayedShape}` : "";

    return buildFinalChart({ title, guide, guideText: manualGuide, originalKey, newKey: enableCapo ? originalKey : effectiveNewKey, capo, rhythm, dynamics, body });
  }, [addRhythm, capoHouse, compact, enableCapo, newKey, originalKey, playedShape, quickTranspose, rawText, editedText, rhythmType, simplify, title, manualGuide]);

  const resultMeta = useMemo(() => {
    const quick = quickTranspose === "custom" ? semitoneDistance(originalKey, newKey) : Number(quickTranspose);
    const effectiveNewKey = transposeNoteToKey(originalKey, quick, newKey);
    const capoHouseNumber = Number(capoHouse);
    const effectiveCapoHouse =
      Number.isFinite(capoHouseNumber) && capoHouseNumber > 0 ? capoHouseNumber : suggestCapo(originalKey, playedShape);
    const effectivePlayedShape = transposeNoteToKey(originalKey, -effectiveCapoHouse, playedShape);
    return {
      key: enableCapo ? originalKey : effectiveNewKey,
      capo: enableCapo ? `${effectiveCapoHouse}ª casa, tocar como ${effectivePlayedShape}` : "Sem capo",
      rhythm: addRhythm ? rhythmType : ""
    };
  }, [addRhythm, capoHouse, enableCapo, newKey, originalKey, playedShape, quickTranspose, rhythmType]);

  const displayBlocks = useMemo(() => {
    const quick = quickTranspose === "custom" ? semitoneDistance(originalKey, newKey) : Number(quickTranspose);
    const capoHouseNumber = Number(capoHouse);
    const effectiveNewKey = transposeNoteToKey(originalKey, quick, newKey);
    const effectiveCapoHouse =
      Number.isFinite(capoHouseNumber) && capoHouseNumber > 0 ? capoHouseNumber : suggestCapo(originalKey, playedShape);

    return songBlocks.map((block) => {
      let content = block.content;
      if (enableCapo) {
        content = applyCapoShape(content, originalKey, playedShape, effectiveCapoHouse);
      } else {
        const semitones = quickTranspose === "custom" ? semitoneDistance(originalKey, newKey) : quick;
        content = transposeTextToKey(content, semitones, effectiveNewKey);
      }
      if (simplify) content = simplifyText(content);
      return { ...block, content };
    });
  }, [capoHouse, enableCapo, newKey, originalKey, playedShape, quickTranspose, simplify, songBlocks]);

  // ─── ACTIONS ─────────────────────────────────────────────────────────────

  async function loadLibraryFiles(query: string) {
    setLibraryStatus("Buscando...");
    const params = new URLSearchParams({ q: query, limit: "60" });
    const [resultResponse, vsResponse] = await Promise.all([
      fetch(`/api/library?kind=resultado&${params.toString()}`),
      fetch(`/api/library?kind=vs&${params.toString()}`)
    ]);
    const resultData = (await resultResponse.json()) as { files?: LibraryFile[]; error?: string };
    const vsData = (await vsResponse.json()) as { files?: LibraryFile[]; error?: string };
    setLibraryResults(resultData.files ?? []);
    setVsTracks(vsData.files ?? []);
    setLibraryStatus(resultData.error ?? vsData.error ?? "");
  }

  async function openSong(file: LibraryFile) {
    setLibraryStatus(`Abrindo ${file.title}...`);
    const response = await fetch(`/api/library/result?name=${encodeURIComponent(file.name)}`);
    const data = (await response.json()) as { text?: string; error?: string };
    if (!response.ok || !data.text) {
      setLibraryStatus(data.error ?? "Falha ao abrir música.");
      return;
    }
    const { instrumentNotes: notes, referenceLinksText: refs, chartText } = parseResultFile(data.text);
    const tracks = findRelatedTracks(file, vsTracks);
    setOpenedSong({ file, chartText, instrumentNotes: notes, referenceLinks: parseReferenceLinks(refs), tracks });
    setLibraryStatus("");
    setAppView("song");
  }

  function openEditorForNew() {
    setTitle("Nova cifra");
    setRawText(SAMPLE);
    setSongBlocks(createSongBlocksFromText(SAMPLE));
    setInstrumentNotes(emptyInstrumentNotes());
    setReferenceLinksText("");
    setManualGuide("");
    setSaveStatus("");
    setAppView("editor");
    setEditorTab("edicao");
  }

  function openEditorForSong(song: OpenedSong) {
    setTitle(song.file.title);
    setRawText(song.chartText);
    setSongBlocks(createSongBlocksFromText(song.chartText));
    setManualGuide(buildSongGuide(organizeSections(song.chartText)).order);
    setInstrumentNotes(song.instrumentNotes);
    setReferenceLinksText(song.referenceLinks.map((l) => l.url).join("\n"));
    setSaveStatus("");
    setAppView("editor");
    setEditorTab("edicao");
  }

  async function handlePdfUpload(file?: File) {
    if (!file) return;
    setPdfStatus("Extraindo texto do PDF...");
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/parse-pdf", { method: "POST", body: formData });
    const data = (await response.json()) as { text?: string; error?: string };
    if (!response.ok || !data.text) { setPdfStatus(data.error ?? "Falha ao ler PDF."); return; }
    setTitle(file.name.replace(/\.[^.]+$/, ""));
    setRawText(data.text);
    setSongBlocks(createSongBlocksFromText(data.text));
    setManualGuide(buildSongGuide(organizeSections(data.text)).order);
    setInstrumentNotes(emptyInstrumentNotes());
    setReferenceLinksText("");
    saveMemoryPdf(file.name, data.text);
    setMemoryPdfs(readMemoryPdfs());
    setEditorTab("edicao");
    setPdfStatus("Texto extraído. Revise antes de editar.");
  }

  async function saveFinalToLibrary() {
    setSaveStatus("Salvando...");
    const filename = `${title || "cifra"}.txt`;
    const content = serializeResultFile(finalChart, instrumentNotes, referenceLinksText);
    const response = await fetch("/api/library/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filename, text: content })
    });
    const data = (await response.json()) as { saved?: string; error?: string };
    if (!response.ok) { setSaveStatus(data.error ?? "Falha ao salvar."); return; }
    setSaveStatus("Salvo na biblioteca!");
    await loadLibraryFiles(libraryQuery);
    setTimeout(() => setSaveStatus(""), 3000);
  }

  async function uploadLibraryFiles(kind: "cifra" | "vs", files?: FileList | null) {
    if (!files?.length) return;
    setLibraryStatus(`Enviando ${files.length} arquivo(s)...`);
    const formData = new FormData();
    formData.append("kind", kind);
    Array.from(files).forEach((file) => formData.append("files", file));
    const response = await fetch("/api/library/upload", { method: "POST", body: formData });
    const data = (await response.json()) as { saved?: string[]; error?: string };
    if (!response.ok) { setLibraryStatus(data.error ?? "Falha ao enviar."); return; }
    setLibraryStatus(`${data.saved?.length ?? 0} arquivo(s) salvo(s).`);
    await loadLibraryFiles(libraryQuery);
  }

  async function copyFinal() { await navigator.clipboard.writeText(finalChart); }

  function downloadTxt() {
    const blob = new Blob([finalChart], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "cifra"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateSongBlock(id: string, patch: Partial<SongBlock>) {
    setSongBlocks((cur) => cur.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function moveSongBlock(index: number, direction: -1 | 1) {
    setSongBlocks((cur) => {
      const next = index + direction;
      if (next < 0 || next >= cur.length) return cur;
      const arr = [...cur];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      setManualGuide(buildSongGuide(songBlocksToSections(arr)).order);
      return arr;
    });
  }

  function addSongBlock() {
    setSongBlocks((cur) => [...cur, { id: `${Date.now()}-parte`, title: "Nova parte", notes: "", content: "" }]);
  }

  function removeSongBlock(id: string) {
    setSongBlocks((cur) => {
      const next = cur.filter((b) => b.id !== id);
      setManualGuide(buildSongGuide(songBlocksToSections(next)).order);
      return next;
    });
  }

  function rebuildBlocksFromRawText() {
    const next = createSongBlocksFromText(rawText);
    setSongBlocks(next);
    setManualGuide(buildSongGuide(songBlocksToSections(next)).order);
  }

  function loadFromMemory(item: MemoryPdf) {
    setTitle(item.name.replace(/\.[^.]+$/, ""));
    setRawText(item.text);
    setSongBlocks(createSongBlocksFromText(item.text));
    setManualGuide(buildSongGuide(organizeSections(item.text)).order);
    setEditorTab("edicao");
  }

  function removeFromMemory(id: string) {
    const next = memoryPdfs.filter((item) => item.id !== id);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
    setMemoryPdfs(next);
  }

  // ─── LIBRARY VIEW ────────────────────────────────────────────────────────

  if (appView === "library") {
    return (
      <main className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Music2 className="h-5 w-5" />
              </div>
              <h1 className="text-lg font-semibold">Guia de Louvor</h1>
            </div>
            <Button variant="outline" size="sm" onClick={openEditorForNew}>
              <Pencil className="h-4 w-4" />
              Nova cifra
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void loadLibraryFiles(libraryQuery); }}
                placeholder="Buscar música..."
                className="pl-9"
              />
            </div>
            <Button onClick={() => loadLibraryFiles(libraryQuery)}>
              <Search className="h-4 w-4" />
              Buscar
            </Button>
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Adicionar VS (MP3)
              <Input type="file" accept="audio/mpeg,.mp3" multiple className="bg-background text-sm" onChange={(e) => uploadLibraryFiles("vs", e.target.files)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Adicionar PDF à biblioteca
              <Input type="file" accept="application/pdf" multiple className="bg-background text-sm" onChange={(e) => uploadLibraryFiles("cifra", e.target.files)} />
            </label>
          </div>

          {libraryStatus ? <p className="text-sm text-muted-foreground">{libraryStatus}</p> : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {librarySongs.length > 0 ? `${librarySongs.length} música(s)` : "Nenhuma música na biblioteca"}
            </p>
            {librarySongs.map((song) => (
              <button
                key={song.name}
                onClick={() => openSong(song)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{song.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[song.key ? `Tom ${song.key}` : "", song.bpm ? `${song.bpm} BPM` : ""].filter(Boolean).join(" · ") || "Cifra"}
                  </p>
                </div>
                {song.tracks.length > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">VS</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ─── SONG DETAIL VIEW ────────────────────────────────────────────────────

  if (appView === "song" && openedSong) {
    return (
      <SongDetailView
        song={openedSong}
        onBack={() => setAppView("library")}
        onEdit={() => openEditorForSong(openedSong)}
      />
    );
  }

  // ─── EDITOR VIEW ─────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" onClick={() => setAppView("library")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Biblioteca
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm font-medium text-muted-foreground truncate">{title || "Nova cifra"}</span>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <Tabs value={editorTab} onValueChange={setEditorTab} className="min-w-0">
          <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
            <TabsList className="grid h-auto min-w-[560px] grid-cols-4 sm:min-w-0">
              <TabsTrigger value="pdf">Importar PDF</TabsTrigger>
              <TabsTrigger value="edicao">Edição</TabsTrigger>
              <TabsTrigger value="observacoes">Observações</TabsTrigger>
              <TabsTrigger value="resultado">Resultado</TabsTrigger>
            </TabsList>
          </div>

          {/* PDF TAB */}
          <TabsContent value="pdf">
            <Card>
              <CardHeader>
                <CardTitle>Importar PDF</CardTitle>
                <CardDescription>Extraia o texto e revise antes de editar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label
                  htmlFor="pdf"
                  className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/40 p-4 text-center sm:p-6"
                >
                  <Upload className="h-8 w-8 text-primary" />
                  <span className="text-sm text-muted-foreground">Selecione um PDF com cifra</span>
                  <Input id="pdf" type="file" accept="application/pdf" className="max-w-sm bg-card text-sm" onChange={(e) => handlePdfUpload(e.target.files?.[0])} />
                </Label>
                {pdfStatus ? <p className="text-sm text-muted-foreground">{pdfStatus}</p> : null}

                {memoryPdfs.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Recentes</p>
                    <div className="space-y-2">
                      {memoryPdfs.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border bg-background p-3">
                          <button className="min-w-0 flex-1 text-left" onClick={() => loadFromMemory(item)}>
                            <span className="block truncate text-sm font-medium">{item.name}</span>
                            <span className="text-xs text-muted-foreground">{new Date(item.savedAt).toLocaleString("pt-BR")}</span>
                          </button>
                          <Button size="icon" variant="ghost" onClick={() => removeFromMemory(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* EDIÇÃO TAB */}
          <TabsContent value="edicao">
            <Card>
              <CardHeader>
                <CardTitle>Edição da cifra</CardTitle>
                <CardDescription>Use acordes entre colchetes: [Am]palavra de Deus.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Título</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div className="grid gap-2 rounded-lg border bg-muted/30 p-4">
                  <Label htmlFor="raw-text">Texto importado</Label>
                  <Textarea id="raw-text" value={rawText} onChange={(e) => setRawText(e.target.value)} className="min-h-32 font-mono text-[13px] leading-5" />
                  <Button type="button" variant="outline" onClick={rebuildBlocksFromRawText} className="w-full sm:w-fit">
                    Recriar blocos pelo texto
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold">Blocos da música</h3>
                    <Button type="button" variant="outline" onClick={addSongBlock}>Nova parte</Button>
                  </div>
                  <div className="space-y-3">
                    {songBlocks.map((block, index) => (
                      <div key={block.id} className="rounded-lg border bg-background p-3 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-2 border-b pb-2">
                          <Input
                            value={block.title}
                            onChange={(e) => updateSongBlock(block.id, { title: e.target.value })}
                            className="h-10 max-w-xs font-semibold"
                          />
                          <div className="flex gap-1">
                            <Button type="button" variant="outline" size="icon" onClick={() => moveSongBlock(index, -1)} disabled={index === 0}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => moveSongBlock(index, 1)} disabled={index === songBlocks.length - 1}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSongBlock(block.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={block.notes}
                          onChange={(e) => updateSongBlock(block.id, { notes: e.target.value })}
                          placeholder="Observação desta parte"
                          className="mb-3 min-h-16 text-right text-xs"
                        />
                        <Textarea
                          value={block.content}
                          onChange={(e) => updateSongBlock(block.id, { content: e.target.value })}
                          className="min-h-40 font-mono text-[14px] leading-6"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">Tom detectado: {detectedKey}</p>

                <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="grid flex-1 gap-2">
                      <Label htmlFor="song-guide">Guia da música</Label>
                      <Textarea
                        id="song-guide"
                        value={manualGuide}
                        onChange={(e) => setManualGuide(e.target.value)}
                        placeholder="Introdução > Verso 1 > Coro > Verso 2 > Coro > Ponte > Coro"
                        className="min-h-20 text-sm"
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={() => setManualGuide(detectedGuide.order)} className="w-full sm:w-auto">
                      Usar guia detectada
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Detectado: {detectedGuide.order || "Nenhuma seção identificada"}</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="reference-links">Links de referência (YouTube, etc.)</Label>
                  <Textarea
                    id="reference-links"
                    value={referenceLinksText}
                    onChange={(e) => setReferenceLinksText(e.target.value)}
                    placeholder="Cole um link por linha"
                    className="min-h-20 text-sm"
                  />
                </div>

                <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
                  <SelectField label="Tom original" value={originalKey} onValueChange={setOriginalKey} />
                  <SelectField label="Novo tom" value={newKey} onValueChange={setNewKey} />
                  <div className="grid gap-2 md:col-span-2">
                    <Label>Transposição rápida</Label>
                    <Select value={quickTranspose} onValueChange={setQuickTranspose}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Usar novo tom</SelectItem>
                        <SelectItem value="1">Subir meio tom</SelectItem>
                        <SelectItem value="-1">Descer meio tom</SelectItem>
                        <SelectItem value="2">Subir 1 tom</SelectItem>
                        <SelectItem value="-2">Descer 1 tom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ToggleRow label="Ativar capo" checked={enableCapo} onCheckedChange={setEnableCapo} />
                  <div className="grid gap-2">
                    <Label htmlFor="capo">Casa do capo</Label>
                    <Input id="capo" type="number" min="0" max="11" value={capoHouse} onChange={(e) => setCapoHouse(e.target.value)} />
                  </div>
                  <SelectField label="Forma tocada" value={playedShape} onValueChange={setPlayedShape} />
                  <ToggleRow label="Simplificar acordes" checked={simplify} onCheckedChange={setSimplify} />
                  <ToggleRow label="Compactar para uma folha" checked={compact} onCheckedChange={setCompact} />
                  <ToggleRow label="Adicionar ritmo" checked={addRhythm} onCheckedChange={setAddRhythm} />
                  <div className="grid gap-2 md:col-span-2">
                    <Label>Tipo de ritmo</Label>
                    <Select value={rhythmType} onValueChange={setRhythmType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(RHYTHMS).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label>Layout de impressão</Label>
                    <Select value={layoutColumns} onValueChange={setLayoutColumns}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 coluna</SelectItem>
                        <SelectItem value="2">2 colunas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => setEditorTab("resultado")} className="md:col-span-2">
                    <FileText className="h-4 w-4" />
                    Ver resultado final
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* OBSERVAÇÕES TAB */}
          <TabsContent value="observacoes">
            <Card>
              <CardHeader>
                <CardTitle>Observações por instrumento</CardTitle>
                <CardDescription>Instruções específicas para cada músico. Salvas junto com a cifra na biblioteca.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {INSTRUMENTS.map(({ key, label }) => (
                  <div key={key} className="grid gap-2">
                    <Label htmlFor={`obs-${key}`}>{label}</Label>
                    <Textarea
                      id={`obs-${key}`}
                      value={instrumentNotes[key]}
                      onChange={(e) => setInstrumentNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={`Observações para ${label.toLowerCase()}...`}
                      className="min-h-20 text-sm"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RESULTADO TAB */}
          <TabsContent value="resultado">
            <ResultCard
              title={title}
              newKey={resultMeta.key}
              capo={resultMeta.capo}
              rhythm={resultMeta.rhythm}
              blocks={displayBlocks}
              columns={layoutColumns}
              finalChart={finalChart}
              referenceLinks={referenceLinks}
              saveStatus={saveStatus}
              onCopy={copyFinal}
              onDownload={downloadTxt}
              onSave={saveFinalToLibrary}
            />
          </TabsContent>
        </Tabs>

        {/* Sticky preview */}
        <ResultCard
          title={title}
          newKey={resultMeta.key}
          capo={resultMeta.capo}
          rhythm={resultMeta.rhythm}
          blocks={displayBlocks}
          columns={layoutColumns}
          finalChart={finalChart}
          referenceLinks={referenceLinks}
          saveStatus={saveStatus}
          onCopy={copyFinal}
          onDownload={downloadTxt}
          onSave={saveFinalToLibrary}
          sticky
        />
      </section>
    </main>
  );
}

// ─── SONG DETAIL VIEW ────────────────────────────────────────────────────────

function SongDetailView({ song, onBack, onEdit }: { song: OpenedSong; onBack: () => void; onEdit: () => void }) {
  const [activeInstrument, setActiveInstrument] = useState<keyof InstrumentNotes>("bateria");
  const [selectedTrack, setSelectedTrack] = useState<LibraryFile | null>(song.tracks[0] ?? null);

  const hasInstrumentNotes = INSTRUMENTS.some(({ key }) => song.instrumentNotes[key].trim());

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Biblioteca
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold">{song.file.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[song.file.key ? `Tom ${song.file.key}` : "", song.file.bpm ? `${song.file.bpm} BPM` : ""].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Reference links */}
        {song.referenceLinks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {song.referenceLinks.map((link, i) => (
              <Button key={i} asChild variant="outline" size="sm">
                <a href={link.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {link.label}
                </a>
              </Button>
            ))}
          </div>
        )}

        {/* VS tracks */}
        {song.tracks.length > 0 && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold">VS</p>
            <div className="flex flex-wrap gap-2">
              {song.tracks.map((track) => (
                <Button
                  key={track.name}
                  size="sm"
                  variant={selectedTrack?.name === track.name ? "default" : "secondary"}
                  onClick={() => setSelectedTrack(track)}
                >
                  <Music2 className="h-4 w-4" />
                  {track.bpm ? `${track.bpm} BPM` : track.title}
                </Button>
              ))}
            </div>
            {selectedTrack && (
              <audio controls className="w-full" src={`/api/library/audio?name=${encodeURIComponent(selectedTrack.name)}`} />
            )}
          </div>
        )}

        {/* Instrument notes */}
        {hasInstrumentNotes && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold">Observações por instrumento</p>
            <div className="flex flex-wrap gap-2">
              {INSTRUMENTS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveInstrument(key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeInstrument === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-14 rounded-md bg-muted/40 px-3 py-2">
              {song.instrumentNotes[activeInstrument] ? (
                <p className="whitespace-pre-wrap text-sm">{song.instrumentNotes[activeInstrument]}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  Sem observações para {INSTRUMENTS.find((i) => i.key === activeInstrument)?.label}.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Chord chart */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Cifra</p>
          </div>
          <div className="overflow-x-auto px-4 py-4">
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed">{song.chartText}</pre>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────

function SelectField({ label, value, onValueChange }: { label: string; value: string; onValueChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {KEY_OPTIONS.map((key) => <SelectItem key={key} value={key}>{key}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-md border bg-background p-3 text-sm font-medium">
      <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(Boolean(v))} />
      {label}
    </label>
  );
}

function ResultCard({
  title, newKey, capo, rhythm, blocks, columns, finalChart,
  referenceLinks, saveStatus, onCopy, onDownload, onSave, sticky = false
}: {
  title: string;
  newKey: string;
  capo: string;
  rhythm: string;
  blocks: SongBlock[];
  columns: string;
  finalChart: string;
  referenceLinks: ReferenceLink[];
  saveStatus: string;
  onCopy: () => void;
  onDownload: () => void;
  onSave: () => void | Promise<void>;
  sticky?: boolean;
}) {
  return (
    <Card className={sticky ? "hidden lg:block lg:sticky lg:top-5 lg:self-start" : ""}>
      <CardHeader>
        <CardTitle>{title || "Resultado final"}</CardTitle>
        <CardDescription>
          {[`Tom ${newKey}`, `Capo: ${capo}`, rhythm ? `Ritmo: ${rhythm}` : ""].filter(Boolean).join(" | ")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 print:hidden sm:flex sm:flex-wrap">
          <Button onClick={onSave} variant="secondary" className="px-2">
            <Save className="h-4 w-4" />
            Salvar na biblioteca
          </Button>
          <Button onClick={onCopy} variant="secondary" className="px-2">
            <Copy className="h-4 w-4" />
            Copiar
          </Button>
          <Button onClick={onDownload} variant="outline" className="px-2">
            <Download className="h-4 w-4" />
            TXT
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="px-2">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
        {saveStatus ? <p className="text-sm text-muted-foreground">{saveStatus}</p> : null}
        {referenceLinks.length > 0 && (
          <div className="space-y-2 print:hidden">
            <h3 className="text-sm font-semibold">Referências</h3>
            <div className="flex flex-wrap gap-2">
              {referenceLinks.map((link, i) => (
                <Button key={`${link.url}-${i}`} asChild variant="outline" size="sm">
                  <a href={link.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {link.label}
                  </a>
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <div id="print-sheet" data-columns={columns} className="mx-auto min-h-[70vh] w-[760px] max-w-none bg-white p-4 shadow-sm sm:min-h-[820px] sm:w-full sm:max-w-[794px] sm:p-8">
            <div className={`print-block-grid ${columns === "2" ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}`}>
              {blocks.map((block) => (
                <section key={block.id} className="print-block break-inside-avoid rounded-md border border-slate-300 bg-white p-3 text-slate-950">
                  <h3 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-normal">{block.title}</h3>
                  {block.notes ? <p className="mt-1 text-right text-[10px] leading-tight text-slate-600">{block.notes}</p> : null}
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-[1.35] sm:text-[12px]">{formatBracketChords(block.content)}</pre>
                </section>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function parseResultFile(text: string): { instrumentNotes: InstrumentNotes; referenceLinksText: string; chartText: string } {
  if (!text.startsWith("[OBSERVACOES]")) {
    return { instrumentNotes: emptyInstrumentNotes(), referenceLinksText: "", chartText: text };
  }

  const metaEnd = text.indexOf("\n[/OBSERVACOES]");
  const metaSection = text.slice("[OBSERVACOES]\n".length, metaEnd);
  const notes = emptyInstrumentNotes();

  for (const line of metaSection.split("\n")) {
    const colonIdx = line.indexOf(": ");
    if (colonIdx === -1) continue;
    const rawLabel = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 2);
    const mappedKey = LABEL_TO_KEY[rawLabel];
    if (mappedKey) (notes as Record<string, string>)[mappedKey] = value;
  }

  let rest = text.slice(metaEnd + "\n[/OBSERVACOES]".length).trimStart();
  let referenceLinksText = "";

  if (rest.startsWith("[REFERENCIAS]")) {
    const refEnd = rest.indexOf("\n[/REFERENCIAS]");
    if (refEnd !== -1) {
      referenceLinksText = rest.slice("[REFERENCIAS]\n".length, refEnd);
      rest = rest.slice(refEnd + "\n[/REFERENCIAS]".length).trimStart();
    }
  }

  return { instrumentNotes: notes, referenceLinksText, chartText: rest };
}

function serializeResultFile(chartText: string, notes: InstrumentNotes, referenceLinksText: string): string {
  const hasMeta = INSTRUMENTS.some(({ key }) => notes[key].trim());
  const hasRefs = referenceLinksText.trim();
  if (!hasMeta && !hasRefs) return chartText;

  let result = "";
  if (hasMeta) {
    result += "[OBSERVACOES]\n";
    result += `Bateria: ${notes.bateria}\n`;
    result += `Violão: ${notes.violao}\n`;
    result += `Guitarra: ${notes.guitarra}\n`;
    result += `Baixo: ${notes.baixo}\n`;
    result += `Vocal: ${notes.vocal}\n`;
    result += "[/OBSERVACOES]\n";
  }
  if (hasRefs) {
    result += "[REFERENCIAS]\n";
    result += referenceLinksText.trim() + "\n";
    result += "[/REFERENCIAS]\n";
  }
  return result + chartText;
}

function readMemoryPdfs(): MemoryPdf[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(MEMORY_KEY);
    return stored ? (JSON.parse(stored) as MemoryPdf[]) : [];
  } catch { return []; }
}

function saveMemoryPdf(name: string, text: string) {
  if (typeof window === "undefined") return;
  const next: MemoryPdf[] = [
    { id: `${Date.now()}-${name}`, name, text, savedAt: new Date().toISOString() },
    ...readMemoryPdfs().filter((item) => item.text !== text)
  ].slice(0, 20);
  localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
}

function findRelatedTracks(file: LibraryFile, tracks: LibraryFile[]) {
  const fileKey = normalizeLibraryName(file.title || file.name);
  return tracks.filter((track) => {
    const trackKey = normalizeLibraryName(track.title || track.name);
    return Boolean(fileKey && trackKey && (fileKey === trackKey || trackKey.includes(fileKey) || fileKey.includes(trackKey)));
  });
}

function normalizeLibraryName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*bpm\b/gi, "")
    .replace(/\btom\s*[a-g](?:#|b)?m?\b/gi, "")
    .replace(/\b[a-g](?:#|b)?m?\b/gi, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase().trim();
}

function parseReferenceLinks(value: string): ReferenceLink[] {
  return value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const url = normalizeReferenceUrl(line);
    return url ? { url, label: getReferenceLabel(url) } : null;
  }).filter((l): l is ReferenceLink => Boolean(l));
}

function normalizeReferenceUrl(value: string) {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch { return null; }
}

function getReferenceLabel(url: string) {
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  if (hostname === "youtu.be" || hostname.endsWith("youtube.com")) return "YouTube";
  return hostname;
}

function createSongBlocksFromText(text: string): SongBlock[] {
  return organizeSections(text).map((section, index) => ({
    id: `${Date.now()}-${index}-${section.title}`,
    title: section.title,
    notes: "",
    content: section.lines.join("\n").trim()
  }));
}

function songBlocksToSections(blocks: SongBlock[]): SongSection[] {
  return blocks
    .filter((b) => b.title.trim() || b.content.trim())
    .map((b) => ({ title: b.title.trim() || "Parte", lines: b.content.split(/\r?\n/) }));
}

function songBlocksToText(blocks: SongBlock[]) {
  return blocks
    .filter((b) => b.title.trim() || b.content.trim())
    .map((b) =>
      [`[${b.title.trim() || "Parte"}]`, b.notes.trim() ? `Obs: ${b.notes.trim()}` : "", b.content]
        .filter((line) => line !== "").join("\n").trimEnd()
    ).join("\n\n");
}
