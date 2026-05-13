"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, Download, ExternalLink, FileText, Music2, Printer, Save, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildFinalChart,
  buildSongGuide,
  compactRepeatedSections,
  formatBracketChords,
  organizeSections,
  sectionsToText
} from "@/lib/chord-parser";
import type { SongSection } from "@/lib/chord-parser";
import {
  applyCapoShape,
  detectOriginalKey,
  KEY_OPTIONS,
  semitoneDistance,
  simplifyText,
  suggestCapo,
  transposeNoteToKey,
  transposeTextToKey
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
  "Balada simples": {
    pattern: "↓ ↓ ↑ ↑ ↓ ↑",
    dynamics: "Verso: leve\nRefrão: cheio\nPonte: crescendo"
  },
  "Pop congregacional": {
    pattern: "↓ ↑ ↓ ↑ ↓ ↑",
    dynamics: "Verso: marcado\nRefrão: aberto\nPonte: crescente"
  },
  "Worship lento": {
    pattern: "↓   ↓ ↑   ↑ ↓",
    dynamics: "Verso: suave\nRefrão: sustentado\nPonte: intenso"
  },
  "Batida 6/8": {
    pattern: "↓ ↓ ↑ ↓ ↑ ↓",
    dynamics: "Verso: fluido\nRefrão: amplo\nPonte: crescendo"
  },
  "Apenas marcação": {
    pattern: "↓   ↓   ↓   ↓",
    dynamics: "Verso: leve\nRefrão: firme\nPonte: livre"
  }
};

type LibraryFile = {
  name: string;
  size: number;
  updatedAt: string;
  title: string;
  key?: string;
  bpm?: string;
};

type MemoryPdf = {
  id: string;
  name: string;
  text: string;
  savedAt: string;
};

type ReferenceLink = {
  url: string;
  label: string;
};

type SongBlock = {
  id: string;
  title: string;
  notes: string;
  content: string;
};

const MEMORY_KEY = "cifra-igreja:pdf-memory";

export function CifraApp() {
  const [title, setTitle] = useState("Nova cifra");
  const [rawText, setRawText] = useState(SAMPLE);
  const [pdfStatus, setPdfStatus] = useState("");
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
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryResults, setLibraryResults] = useState<LibraryFile[]>([]);
  const [vsTracks, setVsTracks] = useState<LibraryFile[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<LibraryFile | null>(null);
  const [libraryStatus, setLibraryStatus] = useState("");
  const [activeTab, setActiveTab] = useState("biblioteca");
  const [referenceLinksText, setReferenceLinksText] = useState("");
  const [manualGuide, setManualGuide] = useState("");
  const [songBlocks, setSongBlocks] = useState<SongBlock[]>(() => createSongBlocksFromText(SAMPLE));
  const [layoutColumns, setLayoutColumns] = useState("1");

  const editedText = useMemo(() => songBlocksToText(songBlocks), [songBlocks]);
  const detectedKey = useMemo(() => detectOriginalKey(editedText || rawText), [editedText, rawText]);
  const librarySongs = useMemo(
    () =>
      libraryResults.map((file) => ({
        ...file,
        tracks: findRelatedTracks(file, vsTracks)
      })),
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

    return buildFinalChart({
      title,
      guide,
      guideText: manualGuide,
      originalKey,
      newKey: enableCapo ? originalKey : effectiveNewKey,
      capo,
      rhythm,
      dynamics,
      body
    });
  }, [
    addRhythm,
    capoHouse,
    compact,
    enableCapo,
    newKey,
    originalKey,
    playedShape,
    quickTranspose,
    rawText,
    editedText,
    rhythmType,
    simplify,
    title,
    manualGuide
  ]);

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

  async function handlePdfUpload(file?: File) {
    if (!file) return;
    setPdfStatus("Extraindo texto do PDF...");
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/parse-pdf", {
      method: "POST",
      body: formData
    });
    const data = (await response.json()) as { text?: string; error?: string };

    if (!response.ok || !data.text) {
      setPdfStatus(data.error ?? "Falha ao ler PDF.");
      return;
    }

    setTitle(file.name.replace(/\.[^.]+$/, ""));
    setRawText(data.text);
    setSongBlocks(createSongBlocksFromText(data.text));
    setManualGuide(buildSongGuide(organizeSections(data.text)).order);
    saveMemoryPdf(file.name, data.text);
    setMemoryPdfs(readMemoryPdfs());
    setActiveTab("edicao");
    setPdfStatus("Texto extraído. Revise a prévia antes de processar.");
  }

  async function copyFinal() {
    await navigator.clipboard.writeText(finalChart);
  }

  async function loadLibraryFiles(query: string) {
    setLibraryStatus("Buscando arquivos...");
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

  async function openLibraryResult(file: LibraryFile) {
    setLibraryStatus(`Abrindo ${file.name}...`);
    const response = await fetch(`/api/library/result?name=${encodeURIComponent(file.name)}`);
    const data = (await response.json()) as { name?: string; text?: string; error?: string };

    if (!response.ok || !data.text) {
      setLibraryStatus(data.error ?? "Falha ao abrir resultado.");
      return;
    }

    setTitle(file.title);
    setRawText(data.text);
    setSongBlocks(createSongBlocksFromText(data.text));
    setManualGuide(buildSongGuide(organizeSections(data.text)).order);
    setSelectedTrack(findRelatedTracks(file, vsTracks)[0] ?? null);
    saveMemoryPdf(data.name ?? file.name, data.text);
    setMemoryPdfs(readMemoryPdfs());
    setActiveTab("edicao");
    setLibraryStatus("Resultado carregado para edição.");
  }

  async function uploadLibraryFiles(kind: "cifra" | "vs", files?: FileList | null) {
    if (!files?.length) return;

    setLibraryStatus(`Enviando ${files.length} arquivo(s)...`);
    const formData = new FormData();
    formData.append("kind", kind);
    Array.from(files).forEach((file) => formData.append("files", file));

    const response = await fetch("/api/library/upload", {
      method: "POST",
      body: formData
    });
    const data = (await response.json()) as { saved?: string[]; error?: string };

    if (!response.ok) {
      setLibraryStatus(data.error ?? "Falha ao salvar arquivos.");
      return;
    }

    setLibraryStatus(`${data.saved?.length ?? 0} arquivo(s) salvo(s) na biblioteca.`);
    await loadLibraryFiles(libraryQuery);
  }

  function downloadTxt() {
    const blob = new Blob([finalChart], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "cifra-igreja"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function saveCurrentToMemory() {
    saveMemoryPdf(`${title || "cifra"}.txt`, rawText);
    setMemoryPdfs(readMemoryPdfs());
  }

  async function saveFinalToMemory() {
    const filename = `${title || "cifra"} - resultado.txt`;
    const response = await fetch("/api/library/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filename, text: finalChart })
    });
    const data = (await response.json()) as { saved?: string; error?: string };

    if (!response.ok) {
      setLibraryStatus(data.error ?? "Falha ao salvar resultado.");
      return;
    }

    saveMemoryPdf(filename, finalChart);
    setMemoryPdfs(readMemoryPdfs());
    setLibraryStatus(`Resultado salvo na biblioteca: ${data.saved ?? filename}`);
    await loadLibraryFiles(libraryQuery);
  }

  function loadFromMemory(item: MemoryPdf) {
    setTitle(item.name.replace(/\.[^.]+$/, ""));
    setRawText(item.text);
    setSongBlocks(createSongBlocksFromText(item.text));
    setManualGuide(buildSongGuide(organizeSections(item.text)).order);
    setActiveTab("edicao");
  }

  function rebuildBlocksFromRawText() {
    const next = createSongBlocksFromText(rawText);
    setSongBlocks(next);
    setManualGuide(buildSongGuide(songBlocksToSections(next)).order);
  }

  function updateSongBlock(id: string, patch: Partial<SongBlock>) {
    setSongBlocks((current) => current.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }

  function moveSongBlock(index: number, direction: -1 | 1) {
    setSongBlocks((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      setManualGuide(buildSongGuide(songBlocksToSections(next)).order);
      return next;
    });
  }

  function addSongBlock() {
    setSongBlocks((current) => [
      ...current,
      {
        id: `${Date.now()}-parte`,
        title: "Nova parte",
        notes: "",
        content: ""
      }
    ]);
  }

  function removeSongBlock(id: string) {
    setSongBlocks((current) => {
      const next = current.filter((block) => block.id !== id);
      setManualGuide(buildSongGuide(songBlocksToSections(next)).order);
      return next;
    });
  }

  function removeFromMemory(id: string) {
    const next = memoryPdfs.filter((item) => item.id !== id);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
    setMemoryPdfs(next);
  }

  return (
    <main className="min-h-screen">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground sm:h-11 sm:w-11">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Cifra Igreja</h1>
              <p className="text-muted-foreground">Organize cifras para ensaio, culto e impressão</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
          <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
          <TabsList className="grid h-auto min-w-[620px] grid-cols-4 sm:min-w-0">
            <TabsTrigger value="biblioteca">Biblioteca</TabsTrigger>
            <TabsTrigger value="pdf">Enviar PDF</TabsTrigger>
            <TabsTrigger value="edicao">Edição</TabsTrigger>
            <TabsTrigger value="resultado">Resultado final</TabsTrigger>
          </TabsList>
          </div>

          <TabsContent value="pdf">
            <Card>
              <CardHeader>
                <CardTitle>Upload de PDF</CardTitle>
                <CardDescription>Extraia o texto e revise a prévia editável antes de processar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label
                  htmlFor="pdf"
                  className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/40 p-4 text-center sm:p-6"
                >
                  <Upload className="h-8 w-8 text-primary" />
                  <span className="text-sm text-muted-foreground">Selecione um PDF com cifra</span>
                  <Input
                    id="pdf"
                    type="file"
                    accept="application/pdf"
                    className="max-w-sm bg-card text-sm"
                    onChange={(event) => handlePdfUpload(event.target.files?.[0])}
                  />
                </Label>
                {pdfStatus ? <p className="text-sm text-muted-foreground">{pdfStatus}</p> : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="biblioteca">
            <Card>
              <CardHeader>
                <CardTitle>Biblioteca</CardTitle>
                <CardDescription>Abra resultados finais em TXT e toque VS em MP3. PDFs servem apenas para leitura inicial.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-col gap-2 md:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={libraryQuery}
                      onChange={(event) => setLibraryQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void loadLibraryFiles(libraryQuery);
                      }}
                      placeholder="Buscar resultados e VS"
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={() => loadLibraryFiles(libraryQuery)} className="w-full md:w-auto">
                    <Search className="h-4 w-4" />
                    Buscar
                  </Button>
                  <Button onClick={saveCurrentToMemory} variant="outline" className="w-full md:w-auto">
                    <Save className="h-4 w-4" />
                    Salvar memoria
                  </Button>
                </div>

                <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">
                    Enviar PDF para leitura inicial
                    <Input
                      type="file"
                      accept="application/pdf"
                      multiple
                      className="bg-background text-sm"
                      onChange={(event) => uploadLibraryFiles("cifra", event.target.files)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Enviar MP3 para VS
                    <Input
                      type="file"
                      accept="audio/mpeg,.mp3"
                      multiple
                      className="bg-background text-sm"
                      onChange={(event) => uploadLibraryFiles("vs", event.target.files)}
                    />
                  </label>
                </div>

                {libraryStatus ? <p className="text-sm text-muted-foreground">{libraryStatus}</p> : null}

                <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                  <LibraryPanel title="Resultados finais" empty="Nenhum resultado final salvo.">
                    {librarySongs.map((file) => (
                      <div key={file.name} className="rounded-md border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <button className="min-w-0 flex-1 text-left" onClick={() => openLibraryResult(file)}>
                            <span className="block truncate text-sm font-medium">{file.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{file.name}</span>
                          </button>
                          <Button size="sm" variant="outline" onClick={() => openLibraryResult(file)}>
                            <FileText className="h-4 w-4" />
                            Abrir
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {file.tracks.length ? (
                            file.tracks.map((track) => (
                              <Button key={track.name} size="sm" variant="secondary" onClick={() => setSelectedTrack(track)}>
                                <Music2 className="h-4 w-4" />
                                {track.bpm ? `${track.bpm} BPM` : "VS"}
                              </Button>
                            ))
                          ) : (
                            <span className="rounded-md border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                              Sem VS relacionado
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </LibraryPanel>

                  <LibraryPanel title="PDFs na memoria" empty="Nenhum PDF salvo nesta sessao.">
                    {memoryPdfs.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border bg-background p-3">
                        <button className="min-w-0 flex-1 text-left" onClick={() => loadFromMemory(item)}>
                          <span className="block truncate text-sm font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground">{new Date(item.savedAt).toLocaleString("pt-BR")}</span>
                        </button>
                        <Button size="icon" variant="ghost" onClick={() => removeFromMemory(item.id)} aria-label="Remover da memoria">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </LibraryPanel>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
                  <LibraryPanel title="VS em MP3" empty="Nenhum MP3 encontrado.">
                    {vsTracks.map((track) => (
                      <button
                        key={track.name}
                        className="w-full rounded-md border bg-background p-3 text-left hover:bg-accent"
                        onClick={() => setSelectedTrack(track)}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Music2 className="h-4 w-4 text-primary" />
                          <span className="truncate">{track.title}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {[track.key, track.bpm ? `${track.bpm} BPM` : ""].filter(Boolean).join(" | ") || track.name}
                        </span>
                      </button>
                    ))}
                  </LibraryPanel>

                  <div className="rounded-lg border bg-background p-4">
                    {selectedTrack ? (
                      <>
                        <div className="mb-3">
                          <p className="font-medium">{selectedTrack.title}</p>
                          <p className="text-sm text-muted-foreground">{selectedTrack.name}</p>
                        </div>
                        <audio
                          controls
                          className="w-full"
                          src={`/api/library/audio?name=${encodeURIComponent(selectedTrack.name)}`}
                        />
                      </>
                    ) : (
                      <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                        Selecione um VS para tocar aqui.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edicao">
            <Card>
              <CardHeader>
                <CardTitle>Cifra em texto</CardTitle>
                <CardDescription>Use acordes entre colchetes: A [Am]palavra de Deus é gran[D]de.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Título</Label>
                  <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div className="grid gap-2 rounded-lg border bg-muted/30 p-4">
                  <Label htmlFor="raw-text">Texto importado</Label>
                  <Textarea id="raw-text" value={rawText} onChange={(event) => setRawText(event.target.value)} className="min-h-32 font-mono text-[13px] leading-5" />
                  <Button type="button" variant="outline" onClick={rebuildBlocksFromRawText} className="w-full sm:w-fit">
                    Recriar blocos pelo texto
                  </Button>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold">Blocos da música</h3>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="outline" onClick={addSongBlock}>
                        Nova parte
                      </Button>
                      <Select value={layoutColumns} onValueChange={setLayoutColumns}>
                        <SelectTrigger className="w-full sm:w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 coluna</SelectItem>
                          <SelectItem value="2">2 colunas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {songBlocks.map((block, index) => (
                      <div key={block.id} className="rounded-lg border bg-background p-3 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-2 border-b pb-2">
                          <Input
                            value={block.title}
                            onChange={(event) => updateSongBlock(block.id, { title: event.target.value })}
                            className="h-10 max-w-xs font-semibold"
                            aria-label="Título do bloco"
                          />
                          <div className="flex gap-1">
                            <Button type="button" variant="outline" size="icon" onClick={() => moveSongBlock(index, -1)} disabled={index === 0} aria-label="Mover para cima">
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => moveSongBlock(index, 1)} disabled={index === songBlocks.length - 1} aria-label="Mover para baixo">
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSongBlock(block.id)} aria-label="Remover parte">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={block.notes}
                          onChange={(event) => updateSongBlock(block.id, { notes: event.target.value })}
                          placeholder="Observações pequenas para esta parte"
                          className="mb-3 min-h-16 text-right text-xs"
                        />
                        <Textarea
                          value={block.content}
                          onChange={(event) => updateSongBlock(block.id, { content: event.target.value })}
                          className="min-h-40 font-mono text-[14px] leading-6"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Tom detectado pela primeira cifra: {detectedKey}</p>
                <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="grid flex-1 gap-2">
                      <Label htmlFor="song-guide">Guia da mÃºsica</Label>
                      <Textarea
                        id="song-guide"
                        value={manualGuide}
                        onChange={(event) => setManualGuide(event.target.value)}
                        placeholder="IntroduÃ§Ã£o > Verso 1 > Coro > Verso 2 > Coro > Ponte > Coro"
                        className="min-h-20 text-sm"
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={() => setManualGuide(detectedGuide.order)} className="w-full sm:w-auto">
                      Usar guia detectada
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Detectado: {detectedGuide.order || "Nenhuma seÃ§Ã£o identificada"}</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reference-links">Links de referência</Label>
                  <Textarea
                    id="reference-links"
                    value={referenceLinksText}
                    onChange={(event) => setReferenceLinksText(event.target.value)}
                    placeholder="Cole um link do YouTube ou outro vídeo por linha"
                    className="min-h-24 text-sm"
                  />
                </div>
                <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
                  <SelectField label="Tom original" value={originalKey} onValueChange={setOriginalKey} />
                  <SelectField label="Novo tom" value={newKey} onValueChange={setNewKey} />
                  <div className="grid gap-2 md:col-span-2">
                    <Label>Transposição rápida</Label>
                    <Select value={quickTranspose} onValueChange={setQuickTranspose}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                    <Input id="capo" type="number" min="0" max="11" value={capoHouse} onChange={(event) => setCapoHouse(event.target.value)} />
                  </div>
                  <SelectField label="Forma tocada" value={playedShape} onValueChange={setPlayedShape} />
                  <ToggleRow label="Simplificar acordes" checked={simplify} onCheckedChange={setSimplify} />
                  <ToggleRow label="Compactar para uma folha" checked={compact} onCheckedChange={setCompact} />
                  <ToggleRow label="Adicionar ritmo" checked={addRhythm} onCheckedChange={setAddRhythm} />
                  <div className="grid gap-2 md:col-span-2">
                    <Label>Tipo de ritmo</Label>
                    <Select value={rhythmType} onValueChange={setRhythmType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(RHYTHMS).map((rhythm) => (
                          <SelectItem key={rhythm} value={rhythm}>
                            {rhythm}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => setActiveTab("resultado")} className="md:col-span-2">
                    <FileText className="h-4 w-4" />
                    Ver resultado final
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


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
              onCopy={copyFinal}
              onDownload={downloadTxt}
              onSave={saveFinalToMemory}
            />
          </TabsContent>
        </Tabs>

        <ResultCard
          title={title}
          newKey={resultMeta.key}
          capo={resultMeta.capo}
          rhythm={resultMeta.rhythm}
          blocks={displayBlocks}
          columns={layoutColumns}
          finalChart={finalChart}
          referenceLinks={referenceLinks}
          onCopy={copyFinal}
          onDownload={downloadTxt}
          onSave={saveFinalToMemory}
          sticky
        />
      </section>
    </main>
  );
}

function SelectField({
  label,
  value,
  onValueChange
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KEY_OPTIONS.map((key) => (
            <SelectItem key={key} value={key}>
              {key}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-md border bg-background p-3 text-sm font-medium">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(Boolean(value))} />
      {label}
    </label>
  );
}

function LibraryPanel({
  title,
  empty,
  children
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="max-h-[340px] space-y-2 overflow-auto rounded-lg border bg-muted/30 p-2 sm:max-h-[430px]">
        {hasItems ? children : <p className="p-3 text-sm text-muted-foreground">{empty}</p>}
      </div>
    </div>
  );
}

function ResultCard({
  title,
  newKey,
  capo,
  rhythm,
  blocks,
  columns,
  finalChart,
  referenceLinks,
  onCopy,
  onDownload,
  onSave,
  sticky = false
}: {
  title: string;
  newKey: string;
  capo: string;
  rhythm: string;
  blocks: SongBlock[];
  columns: string;
  finalChart: string;
  referenceLinks: ReferenceLink[];
  onCopy: () => void;
  onDownload: () => void;
  onSave: () => void | Promise<void>;
  sticky?: boolean;
}) {
  return (
    <Card className={sticky ? "hidden lg:block lg:sticky lg:top-5 lg:self-start" : ""}>
      <CardHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{title || "Resultado final"}</CardTitle>
              <CardDescription>
                {[`Tom ${newKey}`, `Capo: ${capo}`, rhythm ? `Ritmo: ${rhythm}` : ""].filter(Boolean).join(" | ")}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 print:hidden sm:flex sm:flex-wrap">
          <Button onClick={onSave} variant="secondary" className="px-2">
            <Save className="h-4 w-4" />
            Salvar
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
        {referenceLinks.length ? (
          <div className="space-y-2 print:hidden">
            <h3 className="text-sm font-semibold">Referências</h3>
            <div className="flex flex-wrap gap-2">
              {referenceLinks.map((link, index) => (
                <Button key={`${link.url}-${index}`} asChild variant="outline" size="sm">
                  <a href={link.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {link.label}
                  </a>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
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

function readMemoryPdfs(): MemoryPdf[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(MEMORY_KEY);
    return stored ? (JSON.parse(stored) as MemoryPdf[]) : [];
  } catch {
    return [];
  }
}

function saveMemoryPdf(name: string, text: string) {
  if (typeof window === "undefined") return;

  const next: MemoryPdf[] = [
    {
      id: `${Date.now()}-${name}`,
      name,
      text,
      savedAt: new Date().toISOString()
    },
    ...readMemoryPdfs().filter((item) => item.text !== text)
  ].slice(0, 20);

  localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
}

function findRelatedTracks(file: LibraryFile, tracks: LibraryFile[]) {
  const fileKey = libraryMatchKey(file);

  return tracks.filter((track) => {
    const trackKey = libraryMatchKey(track);
    return Boolean(
      fileKey &&
        trackKey &&
        (fileKey === trackKey || trackKey.includes(fileKey) || fileKey.includes(trackKey))
    );
  });
}

function libraryMatchKey(file: LibraryFile) {
  return normalizeLibraryName(file.title || file.name);
}

function normalizeLibraryName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*bpm\b/gi, "")
    .replace(/\btom\s*[a-g](?:#|b)?m?\b/gi, "")
    .replace(/\b[a-g](?:#|b)?m?\b/gi, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim();
}

function parseReferenceLinks(value: string): ReferenceLink[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const url = normalizeReferenceUrl(line);
      return url ? { url, label: getReferenceLabel(url) } : null;
    })
    .filter((link): link is ReferenceLink => Boolean(link));
}

function normalizeReferenceUrl(value: string) {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getReferenceLabel(url: string) {
  const hostname = new URL(url).hostname.replace(/^www\./, "");

  if (hostname === "youtu.be" || hostname.endsWith("youtube.com")) {
    return "YouTube";
  }

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
    .filter((block) => block.title.trim() || block.content.trim())
    .map((block) => ({
      title: block.title.trim() || "Parte",
      lines: block.content.split(/\r?\n/)
    }));
}

function songBlocksToText(blocks: SongBlock[]) {
  return blocks
    .filter((block) => block.title.trim() || block.content.trim())
    .map((block) =>
      [`[${block.title.trim() || "Parte"}]`, block.notes.trim() ? `Obs: ${block.notes.trim()}` : "", block.content]
        .filter((line) => line !== "")
        .join("\n")
        .trimEnd()
    )
    .join("\n\n");
}
