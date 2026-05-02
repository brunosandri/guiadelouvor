# Guia para agentes

## Comandos

- Instalar dependências: `npm install`
- Desenvolvimento: `npm run dev`
- Build: `npm run build`
- Produção local: `npm run start`

## Padrões do projeto

- App Router em `src/app`.
- Componentes reutilizáveis em `src/components`.
- Componentes base de UI em `src/components/ui`, seguindo o estilo shadcn/ui.
- Regras musicais e parser devem ficar em `src/lib`, sem acoplar à interface.
- A primeira versão não usa banco de dados nem login.
- A leitura de PDF deve permanecer em backend/API route.
- A biblioteca local usa as pastas `cifras` para PDFs e `vs` para MP3s na raiz do projeto.
- Rotas de biblioteca não devem expor caminhos absolutos do sistema ao cliente.

## Cuidados ao alterar

- Em produção, a biblioteca aceita `CIFRAS_DIR` e `VS_DIR`; na Railway, preferir Volume montado em `/data`.
- Preserve o formato de entrada com acordes entre colchetes.
- Mantenha suporte a acordes com baixo e extensões, como `F/A`, `C9`, `G/B`, `F#m7`.
- Não misture enarmônicos na saída: tons `F`, `Bb`, `Eb`, `Ab`, `Db`, `Gb` usam bemóis; os demais tons usam sustenidos.
- Evite lógica musical dentro dos componentes React.
- Antes de entregar mudanças, rode `npm run build`.
