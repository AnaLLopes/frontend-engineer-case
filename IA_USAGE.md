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
