# Cifra Igreja

Aplicativo web para ministérios de louvor organizarem cifras vindas de PDF ou texto, com transposição, capo, simplificação, compactação e saída limpa para impressão.

## Stack

- Next.js com App Router
- TypeScript
- Tailwind CSS
- Componentes no padrão shadcn/ui
- PDF parsing em API route com `pdf-parse`
- Lógica musical interna em `src/lib`

## Como rodar

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Build de produção

```bash
npm run build
npm run start
```

## Funcionalidades

- Upload de PDF e extração de texto no backend.
- Acesso a PDFs salvos na memória do navegador.
- Busca e abertura de PDFs da pasta local `cifras`.
- Busca e reprodução de VS em MP3 da pasta local `vs`.
- Caixa para colar cifra manualmente.
- Prévia editável antes do processamento.
- Parser de acordes entre colchetes.
- Conversão de `[Am]palavra` para cifra em duas linhas.
- Organização automática de seções como Intro, Verso, Pré-refrão, Refrão, Ponte, Interlúdio e Final.
- Transposição por tom ou por atalhos de meio tom e um tom.
- Suporte a sustenidos, bemóis, baixo e extensões: `F/A`, `Bb`, `C9`, `G/B`, `F#m7`.
- Sugestão e aplicação de capo.
- Simplificação opcional de acordes.
- Compactação básica de blocos repetidos.
- Ritmo sugerido e dinâmica.
- Copiar resultado, baixar `.txt` e imprimir em folha A4.

## Estrutura

```text
src/app
  api/library/*            Lista cifras, abre PDF local e entrega MP3 local
  api/parse-pdf/route.ts   Rota para leitura de PDF
  page.tsx                 Tela inicial
src/components
  cifra-app.tsx            Experiência principal
  ui/*                     Componentes base shadcn/ui
src/lib
  chord-parser.ts          Parser, organização e saída final
  music.ts                 Notas, transposição, simplificação e capo
  server-library.ts        Acesso seguro as pastas cifras e vs
```

## Biblioteca local

Coloque arquivos nestas pastas na raiz do projeto:

- `cifras`: arquivos `.pdf`
- `vs`: arquivos `.mp3`

A aba Biblioteca permite buscar arquivos por nome. Ao abrir um PDF da pasta `cifras`, o texto é extraído e colocado na prévia editável. Ao selecionar um MP3 da pasta `vs`, o app mostra um player de áudio.

### Biblioteca na Railway

Os arquivos de `cifras` e `vs` não são versionados no GitHub porque PDFs/MP3s podem deixar o deploy pesado. Em produção, use um Volume da Railway ou outro diretório persistente.

Caminhos aceitos pelo app, em ordem:

- Variável `CIFRAS_DIR`
- Padrão `/data/cifras`
- Pasta local `cifras`
- Variável `VS_DIR`
- Padrão `/data/vs`
- Pasta local `vs`

Configuração recomendada na Railway:

```text
CIFRAS_DIR=/data/cifras
VS_DIR=/data/vs
```

Monte um Volume em `/data` e coloque os arquivos em:

```text
/data/cifras/*.pdf
/data/vs/*.mp3
```

Para diagnosticar no navegador:

```text
/api/library/status
```

## Formato de entrada

```text
A [Am]palavra de Deus é gran[D]de
```

Saída:

```text
  Am                    D
A palavra de Deus é grande
```

## Próximos passos sugeridos

- Melhorar a detecção de tom com análise de frequência dos acordes.
- Adicionar testes unitários para `src/lib/music.ts` e `src/lib/chord-parser.ts`.
- Criar editor manual de seções com arrastar e soltar.
- Exportar PDF diretamente no navegador.

## Regra rígida para sustenidos e bemóis

A escolha entre notas equivalentes, como `A#` e `Bb`, é determinada pelo tom final da cifra:

- Tons com bemol usam sempre bemóis: `F`, `Bb`, `Eb`, `Ab`, `Db`, `Gb`.
- Tons neutros ou com sustenido usam sempre sustenidos: `C`, `G`, `D`, `A`, `E`, `B`, `F#`, `C#`, `A#`, `D#`.

Exemplo: ao transpor para `Bb`, a nota equivalente será escrita como `Bb`; ao transpor para `A#`, será escrita como `A#`.
