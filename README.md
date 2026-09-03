# Sistema de Análise de Pedidos — CloudWalk

Engine de análise em **Python** (regras de desconto + detecção de anomalias) e dashboard
de auditoria em **Next.js 14 + TypeScript + Tailwind CSS**.

```
backend/analyzer.py        # engine: consolidação, descontos, anomalias, CLI
backend/customers.json     # entrada: 50 clientes (id, name, tier)
backend/orders.csv         # entrada: 1000 pedidos (id, customer_id, value, date)
test_analyzer.py           # 91 testes pytest: regras de negócio e casos de borda
frontend/tests/            # 132 testes Vitest: contrato, componentes e integração da página
frontend/                  # dashboard Next.js (App Router)
frontend/app/page.tsx      # composição da tela: monta os hooks e os componentes
frontend/hooks/            # useReport (carga, período, importação) e useCustomerFilters
frontend/lib/report.ts     # validação do contrato do JSON em runtime
frontend/lib/format.ts     # formatação pt-BR de moeda, data e período
frontend/lib/pdf.ts        # exportação do relatório em PDF (jsPDF, carregado on demand)
frontend/components/       # DashboardHeader, MetricCards, FiltersBar, CustomersTable,
                           #   AnomalyDrawer, AlertBanner
frontend/app/api/report/   # route handler que reprocessa o analyzer por período
frontend/public/report.json  # artefato gerado pelo backend e lido pela UI
docs/documentacao.html     # documentação ilustrada; abrir no navegador e imprimir em PDF
```

## Pré-requisitos

- Python 3.10+
- Node.js 18.18+ (validado em 22.x)

## Começando (caminho curto)

Três comandos a partir da raiz do projeto:

```bash
npm run setup    # instala as dependências do front-end e gera o report.json
npm run dev      # sobe o dashboard em http://localhost:3000
npm test         # 91 testes pytest + 132 Vitest
```

`npm run setup` não precisa de virtualenv: o analyzer usa apenas a biblioteca
padrão do Python. Já o **pytest é dependência** — se `npm test` falhar com
`No module named pytest`, instale-o no Python que estiver ativo:

```bash
pip install -r backend/requirements.txt
```

Atenção ao virtualenv: com um `.venv` ativado, `python3` passa a ser o do venv,
e o pytest precisa estar instalado **lá dentro** — ter pytest no Python do
sistema não resolve. Ou ative e instale, ou não ative nenhum venv.

O `frontend/public/report.json` já vem versionado, então o dashboard abre com
dados mesmo antes do primeiro `npm run report`. As seções abaixo detalham cada
etapa e a homologação da interface.

## Arquitetura: os dois filtros de período

O enunciado pede o recorte de datas na linha de comando (requisito 5), e a CLI
continua sendo a via canônica. A interface também tem um filtro de datas, e ele
**não** recalcula nada no navegador: manda o pedido para `GET /api/report`, um
route handler que executa `backend/analyzer.py` com as datas e devolve o JSON.

```
carga inicial       → GET /report.json  (o arquivo que a CLI gerou)
campos de data      → GET /api/report?start=…&end=… → spawn analyzer.py → JSON → cards + tabela
CLI                 → analyzer.py --start-date … --output frontend/public/report.json
```

A página **abre com o `frontend/public/report.json`**, isto é, com o recorte que a
CLI gerou — e os campos de data já vêm preenchidos com o período desse arquivo,
para os controles não contradizerem o que está na tela. Gerar o relatório com
`--start-date/--end-date` e recarregar continua funcionando exatamente como antes.
Só se o arquivo não existir a página recorre à API, para o dashboard já servir
antes do primeiro `npm run report`.

A razão de não filtrar no cliente: mudar o período muda **quais** pedidos entram,
e disso dependem o total gasto, o mínimo de 2 pedidos e a média que define as
anomalias. Recalcular no front-end exigiria reimplementar as regras de negócio em
TypeScript, criando duas fontes de verdade para a mesma regra financeira. Além
disso, o `report.json` só carrega agregados por cliente — as datas de pedido
individuais só existem para os suspeitos.

A interface distingue as duas naturezas de filtro:

| Filtro | Onde age |
| :--- | :--- |
| **Período** (de / até) | Reprocessa no backend: descontos e anomalias são recalculados (com debounce de 400 ms) |
| Busca, categoria, apenas anômalos | Recortam no cliente o resultado já calculado |

**Segurança do route handler:** as datas passam por `^\d{4}-\d{2}-\d{2}$` antes
de qualquer coisa, e a execução usa `spawn` com lista de argumentos e `shell: false`
— nada é interpretado por um shell. `?start=; rm -rf /` e `?start=$(whoami)` são
recusados com HTTP 400. Há timeout de 20s, e `PYTHON_BIN`, `REPO_ROOT` e
`ANALYZER_PATH` podem ser sobrescritos por variável de ambiente.

**Sem Python no servidor** (por exemplo num deploy estático), a rota falha e a
página cai no `frontend/public/report.json` já gerado, avisando que o filtro de
período está indisponível. O dashboard continua utilizável.

## 1. Backend — gerar o relatório

```bash
cd frontend-engineer-case

# Ambiente virtual (opcional; o analyzer usa apenas a biblioteca padrão)
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt        # apenas pytest, para os testes

# Relatório completo no stdout
python3 backend/analyzer.py

# Relatório no arquivo consumido pelo front-end
python3 backend/analyzer.py --output frontend/public/report.json

# Com filtro de período (limites inclusivos)
python3 backend/analyzer.py \
  --start-date 2025-01-01 --end-date 2025-01-31 \
  --output frontend/public/report.json
```

Saída esperada da execução completa:

```
Relatório gerado em 'frontend/public/report.json': 50 cliente(s), 1000 pedido(s) no período, 50 com desconto, 49 pedido(s) suspeito(s).
```

Opções da CLI:

| Flag | Padrão | Descrição |
| :--- | :--- | :--- |
| `--start-date` | — | Data inicial `YYYY-MM-DD`, inclusiva |
| `--end-date` | — | Data final `YYYY-MM-DD`, inclusiva |
| `--customers-path` | `backend/customers.json` | Cadastro de clientes |
| `--orders-path` | `backend/orders.csv` | Base de pedidos |
| `--output` | stdout | Arquivo JSON de saída (cria os diretórios) |
| `--anomaly-baseline` | `inclusive` | `inclusive` = média de todos os pedidos do cliente (enunciado); `exclusive` = média dos demais pedidos (leave-one-out) |

Código de saída `0` em sucesso e `2` em erro de dados (data inválida, intervalo
invertido, arquivo ausente, CSV malformado).

## 2. Testes automatizados

**Backend (pytest)** — regras de negócio, casos de borda e o contrato do JSON:

```bash
cd frontend-engineer-case
python3 -m pytest                 # 91 testes
python3 -m pytest -v              # com o nome de cada caso
python3 -m pytest -k desconto     # apenas as regras de desconto
python3 -m pytest -k suspeito     # apenas a detecção de anomalias
```

**Frontend (Vitest + Testing Library)** — 132 testes em `frontend/tests/`:

```bash
npm --prefix frontend run test        # 132 testes
npm --prefix frontend run test:watch  # modo interativo
npm run test                          # backend + frontend, da raiz
```

| Arquivo | O que cobre |
| :--- | :--- |
| `report.test.ts` | `parseReport`: envelope, lista pura, rejeições de contrato e o reconhecimento de `customers.json`/`orders.csv` importados por engano |
| `format.test.ts` | Formatação de período (um limite, dois, limites iguais), moeda e data em `pt-BR` |
| `DashboardPage.test.tsx` | Integração com `fetch` dublado: qual fonte alimenta a carga inicial, o filtro de período, o debounce que colapsa a digitação do ano numa consulta só, o fallback para a API, a preservação dos dados em falha e a corrida entre respostas |
| `FiltersBar.test.tsx` | Os dois grupos de filtro, os limites `min`/`max` que barram intervalo invertido, e os campos de data seguindo editáveis durante o reprocessamento |
| `CustomersTable.test.tsx` | Linhas, estado vazio, formatação `pt-BR` e o botão de auditoria com rótulo acessível |
| `AnomalyDrawer.test.tsx` | `role="dialog"`, fechamento por `Esc`, gestão e devolução de foco, focus trap do `Tab` e travamento do scroll |
| `MetricCards.test.tsx` | Agregação a partir de `desconto_valor` (e não de `bruto − líquido`) e contagem de suspeitas |
| `AlertBanner.test.tsx` | `role="alert"` e o rótulo acessível do botão de dispensar |
| `palette.test.ts` | Extrai a paleta de `tailwind.config.ts` e falha se algum arquivo usar um token `cw-*` inexistente — classe inventada é ignorada em silêncio pelo Tailwind |

## 3. Frontend — instalar e rodar

```bash
cd frontend-engineer-case/frontend
npm install

npm run dev      # http://localhost:3000 (hot reload)
# ou
npm run build && npm run start    # build de produção
npm run lint
npx tsc --noEmit                  # checagem estrita de tipos
```

Atalhos a partir da raiz do projeto:

```bash
npm run setup     # npm install no frontend + gera o report.json
npm run report    # regera frontend/public/report.json
npm run dev       # sobe o Next.js
npm run verify    # pytest + report + build de produção
```

## 4. Homologação da interface

Com `npm run dev` no ar, em `http://localhost:3000`:

1. **Carga dos dados** — os quatro cards no topo devem mostrar `50` clientes,
   volume bruto `R$ 596.652,92`, volume líquido `R$ 553.270,40`
   (descontos de `R$ 43.382,52`) e `49` transações suspeitas.
2. **Período analisado** — o indicador acima dos cards aparece **somente quando o
   relatório declara um recorte de datas**: `01/01/2025 – 31/01/2025` com os dois
   limites, `a partir de 01/02/2025` ou `até 05/01/2025` com um só, e `13/01/2025`
   quando as duas datas são iguais. Numa análise sem filtro ele fica oculto — a
   ausência já diz que os números cobrem o arquivo inteiro.
3. **Tabela** — 50 linhas ordenadas por ID, valores em `pt-BR`, badge dourado
   para VIP, coluna de desconto exibindo o percentual e o valor em reais.
4. **Filtro de período na tela** — preencha `de 2025-01-01` e `até 2025-01-31`: os
   cards devem passar a bruto `R$ 289.379,77`, líquido `R$ 269.181,41` e `16`
   suspeitas, e o indicador de período aparece. Os campos aceitam digitação pelo
   teclado: um `<input type="date">` emite um `change` por dígito do ano, e o
   debounce de 400 ms garante uma única execução do analyzer, com a data completa. Estreitando para `até 2025-01-05`:
   bruto `R$ 45.838,89` e `0` suspeitas. "Limpar período" volta ao completo. Os
   números têm de bater com a mesma consulta na CLI.
5. **Busca** — casa por *substring do nome* **ou** por *ID exato*. `Cliente_7`
   deixa uma linha; `7` deixa **cinco** (`Cliente_7`, `_17`, `_27`, `_37`, `_47`,
   pelo nome — entre elas o `#7`, que casa também pelo ID). Para chegar a um
   cliente só, use o nome completo.
6. **Categoria** — `Apenas VIP` deve deixar 24 linhas; `Apenas Regular`, 26.
7. **Apenas anômalos** — o toggle reduz a tabela a 49 clientes com pedidos
   suspeitos, e os cards passam a refletir o subconjunto visível
   (o card de clientes mostra `49` e `de 50 na base`).
8. **Gaveta lateral de anomalias** — clicar em `⚠ N suspeito(s)` abre o painel à
   direita com, por pedido: número, data em `dd/mm/aaaa`, valor, média do cliente
   e o limiar de 3x. Fecha com o botão `×`, com o botão "Fechar auditoria",
   clicando no fundo escurecido ou pressionando `Esc`; o foco volta para o botão
   que abriu a gaveta.
9. **Filtro de período pela CLI** — regere com um intervalo curto e recarregue:

   ```bash
   python3 backend/analyzer.py --start-date 2025-03-01 --end-date 2025-03-02 \
     --output frontend/public/report.json
   ```

   A UI deve passar a 27 pedidos e 0 suspeitos, e a linha de período passa a `01/03/2025 – 02/03/2025`. O `fetch` usa `cache: 'no-store'`,
   então basta recarregar a página — sem hard refresh e sem rebuild.
10. **Importar report.json** — o botão no topo aceita um relatório gerado em outro
   período; o payload é validado em runtime e um arquivo fora do contrato exibe
   uma mensagem de erro explicando o campo divergente, sem quebrar a tela.
11. **Exportar relatório (PDF)** — o botão verde no topo gera um PDF de 3 páginas
    (`relatorio-pedidos-completo.pdf`, ou `relatorio-pedidos-2025-01-01_a_2025-01-31.pdf`
    quando há período) com cabeçalho, resumo, o consolidado por cliente e uma
    página só de pedidos suspeitos. **Exporta o que está na tela**: com filtros
    ativos, o PDF traz uma linha `Recorte: …` declarando quais e quantos clientes
    de quantos da base. O botão fica desabilitado sem dados carregados.
12. **Estado de erro** — `mv frontend/public/report.json /tmp/` e recarregue: a
   página mostra o alerta "Relatório não carregado" com o comando para gerá-lo.

## Um cuidado ao rodar

`next dev` e `next build` compartilham o diretório `frontend/.next`. Rodar a build
de produção com o servidor de desenvolvimento de pé sobrescreve os artefatos dele
e o dev passa a responder **HTTP 500**. Se acontecer:

```bash
# pare o servidor (Ctrl+C no terminal onde ele roda)
rm -rf frontend/.next
npm run dev
```

Para verificar um build **sem** derrubar o servidor de desenvolvimento, há um
diretório de saída alternativo (`distDir` configurável em `next.config.mjs`):

```bash
cd frontend
npm run build:verify    # NEXT_DIST_DIR=.next-verify next build
npm run start:verify    # serve esse build na porta 3100
```

O mesmo vale ao contrário: um `next start` esquecido de pé faz o `next build`
falhar com `Export encountered errors`. Para achar o processo:

```bash
ss -ltnp | grep :3000
kill <pid>
```

## Contrato do relatório

`frontend/public/report.json` é um envelope com o período da análise e a lista de
clientes. O período fica registrado junto do resultado porque um relatório
financeiro que não declara o próprio recorte temporal não é auditável — e é o que
permite a interface exibir qual filtro gerou os números na tela.

```json
{
  "periodo": { "data_inicial": "2025-01-01", "data_final": "2025-01-31" },
  "clientes": [
    {
      "customer_id": 5,
      "nome": "Cliente_5",
      "categoria": "Regular",
      "total_pedidos": 14,
      "total_gasto_antes_desconto": 10018.5,
      "desconto_aplicado_percentual": 5.0,
      "desconto_valor": 500.93,
      "total_gasto_apos_desconto": 9517.57,
      "pedidos_suspeitos": [
        {
          "order_id": 562,
          "date": "2025-01-04",
          "value": 2435.73,
          "customer_mean": 715.61
        }
      ]
    }
  ]
}
```

`data_inicial` e `data_final` são `null` quando o limite é aberto (análise sem
filtro). `pedidos_analisados` não existe de propósito: é a soma de
`total_pedidos` dos clientes, e dado derivável não se duplica no contrato.

As interfaces equivalentes vivem em `frontend/types/index.ts`
(`AnalysisReport`, `ReportPeriod`, `CustomerReport`, `SuspiciousOrder`). O teste
`test_contrato_python_bate_com_as_interfaces_typescript` falha se os dois lados
saírem de sincronia. O leitor do front-end (`parseReport`) também aceita a lista
pura de clientes, sem envelope — nesse caso o período aparece como desconhecido,
que é diferente de "sem filtro".

## Decisões de implementação

- **`Decimal` em todo o cálculo monetário**, com `ROUND_HALF_UP`; a conversão para
  `float` acontece só na serialização. `total_gasto_antes_desconto` menos
  `total_gasto_apos_desconto` é exatamente `desconto_valor`, sem divergência de centavos.
- **Limiar de R$ 500 exclusivo** ("acima de R$ 500"): R$ 500,00 não recebe desconto,
  R$ 500,01 recebe. A base é o total bruto do período.
- **Mínimo de 2 pedidos avaliado no período filtrado**, não no arquivo inteiro.
- **Anomalia com média inclusiva**, como no enunciado: o próprio pedido entra na média.
  Isso torna a regra matematicamente imune para clientes com até 3 pedidos —
  `--anomaly-baseline exclusive` oferece a variante leave-one-out, mais sensível.
- **Clientes sem pedidos no período** aparecem no relatório zerados, para a auditoria
  ver a base completa.
- **PDF em tema claro e carregado sob demanda.** O documento não copia o tema
  escuro da interface: PDF é feito para imprimir e circular, e fundo preto piora o
  contraste no papel. O `jspdf` (~323 kB) entra por `import()` dinâmico dentro do
  handler, então fica fora do bundle inicial — o First Load da página sobe apenas
  2,7 kB com a feature.
- **Pedidos órfãos** (`customer_id` fora de `customers.json`) ficam fora do relatório
  com aviso em `stderr` informando quantos e qual o valor descartado.
