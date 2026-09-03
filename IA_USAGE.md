# Relatório de Colaboração com IA & Governança de Dados

Este documento registra a metodologia de engenharia assistida por Inteligência Artificial (LLMs) adotada durante a resolução do case técnico da CloudWalk, detalhando os protocolos de segurança contra vazamento de dados (PII) e o processo de co-criação na arquitetura Full-stack (Python + Next.js/React/Tailwind).

---

## 1. Governança de Dados & Prevenção de Vazamento (Data Leakage)

Seguindo as instruções e boas práticas de segurança corporativa no manuseio de LLMs:

1. **Auditoria Prévia de PII (Personally Identifiable Information):**
   - Os arquivos de entrada (`customers.json` e `orders.csv`) foram inspecionados antes de qualquer submissão a modelos de linguagem.
   - Constatou-se a ausência de dados sensíveis reais (como CPFs, dados de cartão de crédito ou e-mails corporativos).
2. **Isolamento de Dados no Prompting:**
   - O dataset completo (1000 transações) **nunca** foi inserido integralmente em janelas de contexto de IA de terceiros.
   - Para elicitação de algoritmos e schemas de tipagem, utilizaram-se apenas amostras mínimas e estruturas sintéticas simuladas (`mocks` simplificados de 2 registros).
3. **Higienização de Credenciais:**
   - Nenhuma variável de ambiente, credencial de infraestrutura ou URL interna de rede foi exposta nos prompts.

---

## 2. Matriz de Colaboração Técnica por Camada

A IA atuou como aceleradora de produtividade e pair programmer, mantendo-se a revisão humana e arquitetural sobre cada decisão:

| Camada / Módulo | Atuação da IA | Papel da Engenheira (Validação & Refatoração) |
| :--- | :--- | :--- |
| **Engine Python (Backend)** | Estruturação de boilerplate do `argparse` e parsing do CSV. | Substituição de tipos primitivos `float` por `Decimal` para evitar erros de precisão financeira em cálculos de desconto e média; tratamento de divisão por zero (`ZeroDivisionError`) para clientes com 0 pedidos. |
| **Testes de Integração** | Sugestão de cenários para `pytest`. | Parametrização dos casos de borda (pedidos exatamente iguais ao limiar de R$ 500 e clientes com apenas 1 transação). |
| **Tipagem TypeScript** | Geração preliminar de interfaces a partir da saída JSON. | Ajuste dos tipos estritos (`'VIP' \| 'Regular'`), refinamento do contrato de anomalias (`SuspiciousOrder`) e eliminação de tipos `any`. |
| **UI Components (React/Tailwind)** | Scaffold de componentes modulares (`MetricCards`, `FiltersBar`, `CustomersTable`, `AnomalyDrawer`). | Adequação semântica ao Design System Dark/Neon da CloudWalk (paleta `#00FF66`, `#FF3366`, `#0A0A0C`), garantia de acessibilidade e implementação do upload dinâmico de arquivos via `FileReader`. |

---

## 3. Registro de Prompts & Intervenção Crítica

### Prompt 1: Modelagem dos Contratos TypeScript (Next.js)
> *"Tenho o seguinte payload JSON gerado por um script de auditoria financeira: `[{"customer_id": 1, "nome": "Cliente_1", "categoria": "VIP", "total_pedidos": 5, "total_gasto_antes_desconto": 1200.5, "desconto_aplicado_percentual": 10.0, "total_gasto_apos_desconto": 1080.45, "pedidos_suspeitos": [{"order_id": 10, "date": "2025-01-15", "value": 900.0, "customer_mean": 240.1}]}]`. Crie as interfaces TypeScript correspondentes para uso em um projeto Next.js App Router com tipagem estrita."*

- **Saída da IA:** Interfaces básicas com `string` e `number`.
- **Validação Humana:** Tipagem da categoria como união literal (`'VIP' | 'Regular'`) para prevenir estados inválidos nos filtros da UI.

### Prompt 2: Paleta Tailwind e Design Dark Mode Fintech
> *"Crie a configuração do `tailwind.config.ts` para um dashboard dark mode de risco financeiro inspirado na estética da CloudWalk/InfinitePay, utilizando background escuro (#0A0A0C), verde neon para saldos positivos (#00FF66) e rosa/magenta neon para alertas de fraude (#FF3366)."*

- **Saída da IA:** Configuração estendida de tema.
- **Validação Humana:** Integração das fontes `Inter` e `JetBrains Mono` via CSS variables do `next/font/google` para manter legibilidade numérica dos valores contábeis.

---

## 4. Conclusão de Eficiência

A utilização de IA reduziu o tempo de escrita de interfaces boilerplate e configurações de estilos utilitários em aproximadamente 60%, viabilizando a entrega de uma experiência completa de Front-end orientada a produto em conjunto com a lógica de dados solicitada pelo backend.

---

## 5. Segunda Rodada: Code Review Assistido por IA

Após a primeira versão funcional, o projeto passou por uma rodada de **code review
rigoroso** conduzida com Claude Code (Opus), com o prompt pedindo validação das
regras de negócio contra o enunciado, caça a edge cases, verificação do contrato
Backend ↔ Frontend e uma suíte completa de testes. Cada apontamento foi
**reproduzido por execução** antes de virar correção — nenhuma conclusão foi
aceita apenas pela afirmação do modelo.

### Achados corrigidos

| Severidade | Achado | Evidência de execução | Correção |
| :--- | :--- | :--- | :--- |
| **Alta** | O front-end não subia: sem `package.json`, `tsconfig.json` vazio (0 byte), sem `postcss.config` (Tailwind não seria processado) e `public/` vazio. | `npm install` sem manifesto; aliases `@/*` sem resolução. | Toolchain completa criada e validada com `npm run build`, `npm run lint` e `tsc --noEmit`. |
| **Média** | CSV malformado, data inválida na CLI e intervalo invertido geravam traceback cru ou silêncio. | `--start-date 13/01/2025` → `ValueError` do `strptime`; `value` vazio → `decimal.InvalidOperation`; intervalo invertido → relatório zerado sem aviso. | `DataError` com mensagem acionável, número de linha do CSV e código de saída `2`. |
| **Média** | Pedidos com `customer_id` inexistente desapareciam sem rastro. | CSV com R$ 5.100 gerava relatório de R$ 100. | Aviso em `stderr` com a contagem e o valor descartado. |
| **Média** | `report.json` ausente era engolido por um `.catch` vazio; a UI mostrava "nenhum registro" em vez de erro. | `next start` responde **400** (e não 404) para o arquivo ausente. | Máquina de estados `loading/ready/empty/error` com o comando de geração na tela. |
| **Média** | O upload de JSON aceitava qualquer payload; um objeto no lugar de lista quebrava a renderização. | `data.filter` sobre não-array. | Validador de runtime campo a campo com mensagem apontando o campo divergente. |
| **Baixa** | A gaveta de anomalias não tinha `role="dialog"`, fechamento por `Esc`, gestão de foco nem `aria-label` no botão `×`. | Navegação por teclado impossível; o leitor de tela anunciava "times". | `role="dialog"`, `aria-modal`, `Esc`, foco de entrada e retorno, travamento do scroll e rótulos acessíveis. |
| **Baixa** | `fetch('/report.json')` sem controle de cache exigia hard refresh após regerar o relatório. | `Cache-Control: public, max-age=0` com ETag. | `cache: 'no-store'`. |

### Evolução do contrato: período no relatório

O enunciado pede o período por linha de comando (requisito 5) e o relatório com
os dados por cliente (requisito 4), mas nada liga os dois: a interface exibia
números sem dizer de que recorte eles vinham — um relatório de janeiro ficava
visualmente idêntico ao completo. O relatório passou a ser um envelope
`{ periodo, clientes }`, onde `clientes` é a "lista de dicionários" do enunciado
e `periodo` registra os limites da análise.

É um desvio consciente da leitura mais literal do item 4, e a justificativa é de
auditoria: um relatório financeiro que não declara o próprio recorte temporal não
é verificável por quem o recebe. Para não quebrar consumidores da forma anterior,
o leitor do front-end (`parseReport`) aceita as duas formas — envelope e lista
pura — e distingue "período desconhecido" (lista pura) de "sem filtro aplicado"
(envelope com os dois limites nulos), que são estados diferentes.

`pedidos_analisados` foi deliberadamente deixado fora do envelope: é a soma de
`total_pedidos` dos clientes, e dado derivável não se duplica no contrato.

### Exportação em PDF

Pedido posterior ao case original. Decisões tomadas e verificadas:

- **Geração real de PDF, não `window.print()`.** O caminho da impressão depende de o
  usuário escolher "Salvar como PDF" no diálogo, e no Linux o destino padrão é
  frequentemente a última impressora usada. Com `jspdf` + `jspdf-autotable` o clique
  entrega um `.pdf` direto.
- **Carregamento sob demanda.** O `import()` dinâmico mantém as ~323 kB da biblioteca
  fora do bundle inicial: o chunk de ~324 kB da biblioteca fica isolado e só baixa
  para quem exporta, enquanto o First Load da página segue em 96,4 kB. Confirmado
  inspecionando `app-build-manifest.json` e os chunks do build.
- **O PDF reflete a tela.** Com filtros ativos, o documento declara o recorte
  (`Recorte: categoria VIP · apenas clientes anômalos — 4 de 50 clientes da base`),
  em vez de exportar silenciosamente um subconjunto sem avisar.
- **Verificação por extração de texto.** O módulo real foi compilado com `tsc` e
  executado em Node, e o PDF resultante teve o texto extraído com `pdftotext` para
  conferir acentuação (`Relatório`, `Análise`, `após`, `média`), o travessão do
  período, a formatação `R$ 289.379,77`, e a igualdade de todos os totais com a
  saída do Python.

### Filtro de período na interface

O pedido era ter o recorte de datas também na tela, filtrando cards e tabela, sem
perder o filtro da CLI. O obstáculo não era de UI: o `report.json` só tem agregados
por cliente, sem as datas dos pedidos individuais, então o navegador não tinha
dados para refiltrar.

As duas saídas eram embutir todos os pedidos no JSON e **reimplementar as regras de
desconto e anomalia em TypeScript**, ou o front-end pedir ao backend o relatório do
período. Escolhi a segunda: um route handler (`GET /api/report`) executa o
`analyzer.py` com as datas. As regras financeiras seguem existindo em um único
lugar — duplicá-las em duas linguagens é justamente o risco que uma auditoria não
pode correr.

Cuidados de implementação, todos verificados por execução:

- **Injeção de comando:** as datas são validadas contra `^\d{4}-\d{2}-\d{2}$` e a
  execução usa `spawn` com lista de argumentos e `shell: false`. `?start=; rm -rf /`
  e `?start=$(whoami)` respondem HTTP 400.
- **Respostas fora de ordem:** um contador de requisição descarta o resultado de uma
  consulta já superada por outra mais nova, para trocas rápidas de data não deixarem
  um resultado antigo vencer na tela.
- **Degradação sem Python:** sem o interpretador no servidor, a página cai no
  `report.json` estático e avisa que o filtro de período está indisponível.
- **Erros semânticos vêm do Python:** intervalo invertido e `2025-02-30` são
  recusados pelo próprio analyzer, e a rota repassa a mensagem dele — a interface
  não reimplementa nem essa validação.

A verificação foi feita dirigindo o Chrome pelo protocolo de debug (com o
`WebSocket` nativo do Node 22, sem adicionar dependência): preenchi os campos de
data, capturei o texto dos cards e comparei com a mesma consulta na CLI. Janeiro
rendeu `R$ 289.379,77` e 16 suspeitas; de 01 a 05 de janeiro, `R$ 45.838,89` e 0 —
iguais nas duas vias.

### Testes de front-end

Suíte com Vitest + Testing Library (132 testes), escrita depois do backend e com
duas descobertas registradas:

- **Um teste de contrato de paleta.** O Tailwind ignora silenciosamente uma classe
  que não existe no tema — `bg-cw-inventado` não quebra build nem lint, só não
  pinta nada. O teste extrai a paleta do próprio `tailwind.config.ts` e falha se
  algum arquivo usar um token fora dela. A primeira versão do teste tinha a lista
  de cores **duplicada à mão**, e por isso acusou um falso positivo em
  `bg-cw-white` (token que existia na configuração); passar a ler do config
  eliminou a classe inteira de erro.
- **Um cenário de corrida que a interface já impedia.** O teste original tentava
  disparar duas consultas de período em sequência para verificar o descarte de
  resposta antiga — e falhou, porque os campos de data ficam `disabled` durante o
  reprocessamento, tornando aquele caminho inalcançável. A corrida real e
  alcançável é outra: mudar o período enquanto a carga inicial ainda está no ar.
  O teste foi reescrito para o cenário verdadeiro, e um segundo teste passou a
  documentar o `disabled` como a outra metade da proteção.

Os arquivos de teste ficam sob o mesmo `tsc --noEmit` estrito da aplicação, o que
reprovou dois padrões que o Vitest aceitava (`let resolver: (() => void) | null`
estreitado para `never`, e um cast sem passar por `unknown`) — resolvidos com um
helper `deferred()` tipado.

### Cobertura resultante

91 testes `pytest` cobrindo as três regras de desconto (incluindo o limiar
exclusivo de R$ 500 e o mínimo de 2 pedidos avaliado *no período filtrado*), a
detecção de anomalias (limiar exclusivo de 3x, valores iguais, cliente com um
único pedido, as duas bases de média), o filtro de datas (limites inclusivos,
período vazio, intervalo invertido, formato inválido), a precisão monetária, a
robustez de leitura dos arquivos e o contrato consumido pelo Next.js
(incluindo o envelope de período e a normalização dos seus limites).

---

## 6. Terceira Rodada: Revisão de Arquitetura Pré-Entrega

Última passagem antes de entregar, com o pedido explícito de revisar estrutura,
clean code, componentização e a aderência ao enunciado. A conformidade com os
cinco requisitos foi reconferida item a item contra o texto do desafio, e os
números do roteiro de homologação do README foram reproduzidos pela CLI
(janeiro: `R$ 289.379,77` e 16 suspeitas; até 05/01: `R$ 45.838,89` e 0; 24 VIP
e 26 Regular). Nenhuma divergência.

### Refatoração: a página virou composição

`app/page.tsx` tinha **367 linhas e 14 `useState`**. Os componentes filhos já
estavam bem fatiados, mas a página acumulava carga inicial, reprocessamento por
período, importação de arquivo, exportação em PDF, filtros locais e o JSX do
cabeçalho — um dev novo precisava ler tudo para saber onde mexer.

| Extraído | Responsabilidade |
| :--- | :--- |
| `hooks/useReport.ts` | As três vias que trazem dados: arquivo, API por período e importação. Convergem no mesmo estado porque respondem à mesma pergunta — qual relatório está na tela e de onde veio. |
| `hooks/useCustomerFilters.ts` | Busca, categoria e "apenas anômalos": o recorte no cliente sobre o resultado já calculado. |
| `components/DashboardHeader.tsx` | Cabeçalho com exportar e importar. |
| `lib/format.ts` | Formatação `pt-BR` de moeda, data e período, que estava em `lib/report.ts`. |

A página caiu para **189 linhas e 3 `useState`** — o que sobrou é layout e a
árvore de estados de carregamento, que é o trabalho legítimo dela. A separação
de `lib/format.ts` corrigiu um cheiro de acoplamento: uma tabela importando
`formatBRL` de um módulo chamado `report` sugeria uma dependência que não existe.

O `useReport` recebe `onDatasetReplaced` em vez de conhecer a seleção da gaveta —
a inversão mantém o hook ignorante da UI e testável isoladamente.

**Nenhum teste precisou ser reescrito para acomodar a refatoração.** Os 123
testes existentes exercitam comportamento pela interface pública dos componentes,
não estrutura interna, e passaram sem alteração — que é exatamente a prova de que
uma suíte serve para refatorar com segurança. As únicas mudanças nos testes foram
o desmembramento de `format.test.ts` (acompanhando a separação do módulo) e dois
casos novos para o focus trap.

### Focus trap na gaveta de anomalias

A gaveta declarava `aria-modal="true"` e tinha `Esc`, foco de entrada e devolução
de foco — mas o `Tab` escapava para os controles atrás do overlay. `aria-modal`
só promete a semântica ao leitor de tela; a contenção do foco é responsabilidade
de quem implementa. Implementado o ciclo nos dois sentidos (`Tab` no último volta
ao primeiro, `Shift+Tab` no primeiro vai ao último), com dois testes cobrindo os
dois sentidos e verificando que um botão fora da gaveta não recebe o foco.

### Correções de documentação

Duas afirmações deste próprio relatório tinham envelhecido e foram corrigidas:

- O First Load estava registrado como 94,9 kB; a build atual dá **96,4 kB**. O que
  a medição sustenta é o essencial — o chunk de ~324 kB do jsPDF fica isolado e só
  baixa para quem exporta.
- A nota sobre `npm audit` afirmava que `next@14.2.35` era a versão com o patch de
  segurança. Era, à data da entrega. A afirmação foi datada e acrescida da situação
  atual: advisories posteriores do Next só têm correção na linha 16.x, e nenhum
  deles alcança a superfície desta aplicação.

Corrigir o documento em vez de deixá-lo envelhecer é parte do mesmo princípio que
levou o período para dentro do relatório: um artefato que descreve um estado
precisa dizer de quando é.

### O "nit" que era defeito: debounce no filtro de período

Na primeira passagem eu havia classificado como observação menor o fato de cada
alteração nos campos de data disparar um `spawn` do Python, argumentando que o
`disabled` durante o reprocessamento continha o problema. **Estava errado**, e a
medição no navegador mostrou por quê.

Um `<input type="date">` emite um `change` a cada dígito do ano, porque a data
fica válida a cada passo. Digitando `2025` num campo pelado:

```
eventos change: ["0002-01-01", "0020-01-01", "0202-01-01", "2025-01-01"]
```

Na aplicação, o primeiro deles disparava o reprocessamento, o `disabled` entrava,
e **os três dígitos restantes eram engolidos**. Medido pelo protocolo de debug do
Chrome contra o servidor real:

| | Campo ao final | Chamadas ao backend |
| :--- | :--- | :--- |
| Antes | `0002-01-01` (travado) | `/api/report?start=0002-01-01` |
| Depois | `2025-01-01` | `/api/report?start=2025-01-01` |

Quem digitasse a data pelo teclado ficava preso no ano 2, com uma execução do
analyzer desperdiçada. Só funcionava usando o seletor de calendário. O `disabled`
não continha o problema: trocava "quatro execuções" por "uma execução errada mais
a digitação perdida".

A correção foi debounce de 400 ms no `changePeriod` e a remoção do `disabled` dos
dois campos de data — o botão "Limpar período" continua bloqueado, porque não é
campo de digitação. O `reprocessing` sobe **antes** do debounce, de propósito: os
números na tela já pertencem a outro recorte, e escurecê-los na hora é o sinal
honesto.

O `disabled` tinha sido introduzido como "a outra metade da proteção" contra
respostas fora de ordem. Essa proteção nunca dependeu dele: o contador de
requisição no `useReport` descarta qualquer resposta superada. Era redundante ali
e nocivo aqui — o teste que documentava o bloqueio foi reescrito para documentar
o oposto, com o motivo registrado no corpo do teste.

Ganho colateral confirmado na mesma medição: preencher as duas datas em sequência
colapsa numa **única** chamada `?start=2025-01-01&end=2025-01-31`, devolvendo
`R$ 289.379,77` e 16 suspeitas — idêntico à CLI. Antes seriam duas execuções.

A mesma bateria flagrou o tratamento de um ano de 5 dígitos (`12025-03-01`, que a
simulação de teclado produziu por acidente): a rota recusou com HTTP 400, o banner
nomeou o parâmetro divergente e as 50 linhas continuaram na tela — a degradação
projetada, funcionando.

### Revisão final: a documentação conferida por execução

Última passagem rodando **cada comando do README como está escrito** e provando
cada regra do enunciado por recálculo independente — um script que relê
`customers.json` e `orders.csv` do zero e compara com a saída do analyzer, em vez
de confiar nos testes que acompanham o código:

| Requisito | Verificação | Divergências |
| :--- | :--- | :--- |
| 1. Consolidação | 50 clientes e 1000 pedidos, do CSV ao relatório | 0 |
| 2. Descontos | Regra reaplicada aos 50 clientes (24 VIP a 10%, 26 Regular a 5%) | 0 |
| 3. Anomalias | Média e limiar de 3x recalculados por cliente | 0 |
| 4. Campos | Nome, categoria, totais antes/depois e suspeitos | todos presentes |
| 5. Período | Limites inclusivos, recorte aplicado antes da análise, mínimo de 2 pedidos avaliado no período | 0 |

Os códigos de saída também: `2` para data inválida, intervalo invertido e arquivo
ausente; `0` no sucesso.

Um erro de documentação foi encontrado assim. O roteiro de homologação afirmava
que digitar `7` na busca "casa o ID exato", sugerindo uma linha — mas a busca é a
**união** de substring do nome com ID exato, e `7` devolve cinco linhas
(`Cliente_7`, `_17`, `_27`, `_37`, `_47`). O comportamento é razoável; a descrição
é que estava errada. Corrigida, e travada por um teste, para não voltar a divergir.

### Estado verificado na entrega

`91 pytest` · `132 Vitest` · `tsc --noEmit` sem erros · ESLint sem avisos · build
de produção · e um smoke test contra o servidor de verdade, conferindo a página,
o `GET /api/report` por período (`R$ 289.379,77`, 16 suspeitas, iguais à CLI), o
debounce da digitação e a recusa de `?start=; rm -rf /` com HTTP 400.
