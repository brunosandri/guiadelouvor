"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Copy, Download, FileText, Music2, Printer, Save, Search, Trash2, Upload } from "lucide-react";
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
  compactRepeatedSections,
  formatBracketChords,
  organizeSections,
  sectionsToText
} from "@/lib/chord-parser";
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
  const [libraryPdfs, setLibraryPdfs] = useState<LibraryFile[]>([]);
  const [vsTracks, setVsTracks] = useState<LibraryFile[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<LibraryFile | null>(null);
  const [libraryStatus, setLibraryStatus] = useState("");

  const detectedKey = useMemo(() => detectOriginalKey(rawText), [rawText]);

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
    let workingText = rawText;

    if (enableCapo) {
      workingText = applyCapoShape(workingText, originalKey, playedShape, effectiveCapoHouse);
    } else {
      workingText = transposeTextToKey(workingText, semitones, effectiveNewKey);
    }

    if (simplify) workingText = simplifyText(workingText);

    let sections = organizeSections(workingText);
    if (compact) sections = compactRepeatedSections(sections);

    const body = formatBracketChords(sectionsToText(sections));
    const rhythm = addRhythm ? `${rhythmType}\n${RHYTHMS[rhythmType].pattern}` : "";
    const dynamics = addRhythm ? RHYTHMS[rhythmType].dynamics : "";
    const capo = enableCapo ? `${effectiveCapoHouse}ª casa, tocar como ${effectivePlayedShape}` : "";

    return buildFinalChart({
      title,
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
    rhythmType,
    simplify,
    title
  ]);

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

    setRawText(data.text);
    saveMemoryPdf(file.name, data.text);
    setMemoryPdfs(readMemoryPdfs());
    setPdfStatus("Texto extraído. Revise a prévia antes de processar.");
  }

  async function copyFinal() {
    await navigator.clipboard.writeText(finalChart);
  }

  async function loadLibraryFiles(query: string) {
    setLibraryStatus("Buscando arquivos...");
    const params = new URLSearchParams({ q: query, limit: "60" });
    const [pdfResponse, vsResponse] = await Promise.all([
      fetch(`/api/library?kind=cifra&${params.toString()}`),
      fetch(`/api/library?kind=vs&${params.toString()}`)
    ]);

    const pdfData = (await pdfResponse.json()) as { files?: LibraryFile[]; error?: string };
    const vsData = (await vsResponse.json()) as { files?: LibraryFile[]; error?: string };

    setLibraryPdfs(pdfData.files ?? []);
    setVsTracks(vsData.files ?? []);
    setLibraryStatus(pdfData.error ?? vsData.error ?? "");
  }

  async function openLibraryPdf(file: LibraryFile) {
    setLibraryStatus(`Abrindo ${file.name}...`);
    const response = await fetch(`/api/library/pdf?name=${encodeURIComponent(file.name)}`);
    const data = (await response.json()) as { name?: string; text?: string; error?: string };

    if (!response.ok || !data.text) {
      setLibraryStatus(data.error ?? "Falha ao abrir PDF.");
      return;
    }

    setTitle(file.title);
    setRawText(data.text);
    saveMemoryPdf(data.name ?? file.name, data.text);
    setMemoryPdfs(readMemoryPdfs());
    setLibraryStatus("PDF carregado na previa e salvo na memoria.");
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

  function loadFromMemory(item: MemoryPdf) {
    setTitle(item.name.replace(/\.[^.]+$/, ""));
    setRawText(item.text);
  }

  function removeFromMemory(id: string) {
    const next = memoryPdfs.filter((item) => item.id !== id);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
    setMemoryPdfs(next);
  }

  return (
    <main className="min-h-screen">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">Cifra Igreja</h1>
              <p className="text-muted-foreground">Organize cifras para ensaio, culto e impressão</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <Tabs defaultValue="pdf" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="pdf">Enviar PDF</TabsTrigger>
            <TabsTrigger value="biblioteca">Biblioteca</TabsTrigger>
            <TabsTrigger value="texto">Colar cifra</TabsTrigger>
            <TabsTrigger value="config">Configurações</TabsTrigger>
            <TabsTrigger value="resultado">Resultado final</TabsTrigger>
          </TabsList>

          <TabsContent value="pdf">
            <Card>
              <CardHeader>
                <CardTitle>Upload de PDF</CardTitle>
                <CardDescription>Extraia o texto e revise a prévia editável antes de processar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label
                  htmlFor="pdf"
                  className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/40 p-6 text-center"
                >
                  <Upload className="h-8 w-8 text-primary" />
                  <span className="text-sm text-muted-foreground">Selecione um PDF com cifra</span>
                  <Input
                    id="pdf"
                    type="file"
                    accept="application/pdf"
                    className="max-w-sm bg-card"
                    onChange={(event) => handlePdfUpload(event.target.files?.[0])}
                  />
                </Label>
                {pdfStatus ? <p className="text-sm text-muted-foreground">{pdfStatus}</p> : null}
                <Textarea value={rawText} onChange={(event) => setRawText(event.target.value)} className="min-h-80 font-mono" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="biblioteca">
            <Card>
              <CardHeader>
                <CardTitle>Biblioteca</CardTitle>
                <CardDescription>Abra PDFs salvos na memoria, busque na pasta cifras e toque VS em MP3.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={libraryQuery}
                      onChange={(event) => setLibraryQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void loadLibraryFiles(libraryQuery);
                      }}
                      placeholder="Buscar em cifras e VS"
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={() => loadLibraryFiles(libraryQuery)}>
                    <Search className="h-4 w-4" />
                    Buscar
                  </Button>
                  <Button onClick={saveCurrentToMemory} variant="outline">
                    <Save className="h-4 w-4" />
                    Salvar memoria
                  </Button>
                </div>

                {libraryStatus ? <p className="text-sm text-muted-foreground">{libraryStatus}</p> : null}

                <div className="grid gap-4 xl:grid-cols-3">
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

                  <LibraryPanel title="Pasta cifras" empty="Nenhum PDF encontrado.">
                    {libraryPdfs.map((file) => (
                      <button
                        key={file.name}
                        className="w-full rounded-md border bg-background p-3 text-left hover:bg-accent"
                        onClick={() => openLibraryPdf(file)}
                      >
                        <span className="block truncate text-sm font-medium">{file.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{file.name}</span>
                      </button>
                    ))}
                  </LibraryPanel>

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
                </div>

                {selectedTrack ? (
                  <div className="rounded-lg border bg-background p-4">
                    <div className="mb-3">
                      <p className="font-medium">{selectedTrack.title}</p>
                      <p className="text-sm text-muted-foreground">{selectedTrack.name}</p>
                    </div>
                    <audio
                      controls
                      className="w-full"
                      src={`/api/library/audio?name=${encodeURIComponent(selectedTrack.name)}`}
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="texto">
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
                <Textarea value={rawText} onChange={(event) => setRawText(event.target.value)} className="min-h-[440px] font-mono" />
                <p className="text-sm text-muted-foreground">Tom detectado pela primeira cifra: {detectedKey}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Configurações</CardTitle>
                <CardDescription>Ajuste tom, capo, simplificação, compactação e ritmo.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Tom original" value={originalKey} onValueChange={setOriginalKey} />
                <SelectField label="Novo tom" value={newKey} onValueChange={setNewKey} />
                <div className="grid gap-2 sm:col-span-2">
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
                <div className="grid gap-2 sm:col-span-2">
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resultado">
            <ResultCard finalChart={finalChart} onCopy={copyFinal} onDownload={downloadTxt} />
          </TabsContent>
        </Tabs>

        <ResultCard finalChart={finalChart} onCopy={copyFinal} onDownload={downloadTxt} sticky />
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
    <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm font-medium">
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
      <div className="max-h-[430px] space-y-2 overflow-auto rounded-lg border bg-muted/30 p-2">
        {hasItems ? children : <p className="p-3 text-sm text-muted-foreground">{empty}</p>}
      </div>
    </div>
  );
}

function ResultCard({
  finalChart,
  onCopy,
  onDownload,
  sticky = false
}: {
  finalChart: string;
  onCopy: () => void;
  onDownload: () => void;
  sticky?: boolean;
}) {
  return (
    <Card className={sticky ? "hidden lg:block lg:sticky lg:top-5 lg:self-start" : ""}>
      <CardHeader>
        <CardTitle>Resultado final</CardTitle>
        <CardDescription>Visualização em folha A4 pronta para impressão.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button onClick={onCopy} variant="secondary">
            <Copy className="h-4 w-4" />
            Copiar
          </Button>
          <Button onClick={onDownload} variant="outline">
            <Download className="h-4 w-4" />
            TXT
          </Button>
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
        <div id="print-sheet" className="mx-auto min-h-[820px] w-full max-w-[794px] bg-white p-8 shadow-sm">
          <pre className="whitespace-pre-wrap font-mono text-[12px] leading-[1.32] text-slate-950">{finalChart}</pre>
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
