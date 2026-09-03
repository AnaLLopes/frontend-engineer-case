"""Consolida clientes e pedidos, aplica regras de desconto e detecta anomalias.

Regras implementadas (conforme enunciado do desafio):
  1. Consolidação de customers.json + orders.csv por `customer_id`.
  2. Descontos:
       - VIP: 10% sobre o total gasto.
       - Regular: 5% se o total gasto for acima de R$ 500.
       - Em ambos os casos, somente com >= 2 pedidos no período analisado.
  3. Anomalia: pedido cujo valor supera 3x a média dos pedidos daquele cliente.
  4. Relatório em JSON: um envelope com `periodo` (os limites da análise) e
     `clientes` (a lista de dicionários pedida no enunciado). O período fica
     registrado junto do resultado porque um relatório financeiro que não
     declara o próprio recorte temporal não é auditável.
  5. Filtro de período via --start-date / --end-date (limites inclusivos).

Todo o cálculo monetário usa `Decimal` com arredondamento ROUND_HALF_UP
(arredondamento comercial brasileiro); a conversão para `float` acontece apenas
na serialização final do JSON.
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, DecimalException, ROUND_HALF_UP

CENTS = Decimal("0.01")
DATE_FORMAT = "%Y-%m-%d"

VIP_RATE = Decimal("0.10")
REGULAR_RATE = Decimal("0.05")
REGULAR_THRESHOLD = Decimal("500.00")
MIN_ORDERS_FOR_DISCOUNT = 2
ANOMALY_FACTOR = Decimal("3")

TIER_VIP = "VIP"
TIER_REGULAR = "Regular"
TIER_ALIASES = {"vip": TIER_VIP, "regular": TIER_REGULAR, "regulares": TIER_REGULAR}


class DataError(ValueError):
    """Erro de dados de entrada, com mensagem acionável para o operador."""


def warn(message: str) -> None:
    print(f"[aviso] {message}", file=sys.stderr)


def money(value: Decimal) -> float:
    """Arredonda para centavos e converte para float (fronteira de serialização)."""
    return float(value.quantize(CENTS, rounding=ROUND_HALF_UP))


def parse_date(value: str, flag: str) -> date:
    try:
        return datetime.strptime(value.strip(), DATE_FORMAT).date()
    except ValueError:
        raise DataError(
            f"{flag} recebeu '{value}', que não é uma data válida no formato YYYY-MM-DD."
        ) from None


def normalize_tier(raw_tier) -> str:
    tier = str(raw_tier or "").strip()
    return TIER_ALIASES.get(tier.lower(), tier)


def parse_args(argv=None):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(
        description="Analisa clientes, pedidos, descontos e anomalias."
    )
    parser.add_argument("--start-date", default=None, help="Data inicial (YYYY-MM-DD, inclusiva)")
    parser.add_argument("--end-date", default=None, help="Data final (YYYY-MM-DD, inclusiva)")
    parser.add_argument(
        "--customers-path",
        default=os.path.join(base_dir, "customers.json"),
        help="Caminho para customers.json",
    )
    parser.add_argument(
        "--orders-path",
        default=os.path.join(base_dir, "orders.csv"),
        help="Caminho para orders.csv",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Arquivo JSON de saída (ex: frontend/public/report.json). Sem isso, imprime no stdout.",
    )
    parser.add_argument(
        "--anomaly-baseline",
        choices=("inclusive", "exclusive"),
        default="inclusive",
        help=(
            "Base da média usada na detecção de anomalias. 'inclusive' (padrão) segue o "
            "enunciado: média de todos os pedidos do cliente. 'exclusive' usa a média dos "
            "demais pedidos (leave-one-out), mais sensível em períodos curtos."
        ),
    )
    return parser.parse_args(argv)


def load_customers(filepath: str) -> dict:
    """Carrega customers.json indexado por id, com tier canonizado."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        raise DataError(f"Arquivo de clientes não encontrado: {filepath}") from None
    except json.JSONDecodeError as exc:
        raise DataError(f"customers.json inválido ({filepath}): {exc}") from None

    if not isinstance(data, list):
        raise DataError("customers.json deve conter uma lista de objetos de cliente.")

    customers = {}
    unknown_tiers = set()
    for index, raw in enumerate(data, start=1):
        if not isinstance(raw, dict) or "id" not in raw:
            raise DataError(f"Cliente na posição {index} não possui o campo 'id'.")
        try:
            cust_id = int(raw["id"])
        except (TypeError, ValueError):
            raise DataError(f"Cliente na posição {index} tem 'id' não numérico: {raw['id']!r}.") from None

        if cust_id in customers:
            warn(f"id de cliente duplicado em customers.json: {cust_id} (mantendo o último registro).")

        tier = normalize_tier(raw.get("tier"))
        if tier not in (TIER_VIP, TIER_REGULAR):
            unknown_tiers.add(tier or "<vazio>")

        customers[cust_id] = {
            "id": cust_id,
            "name": str(raw.get("name") or f"Cliente_{cust_id}"),
            "tier": tier,
        }

    if unknown_tiers:
        warn(
            "tier(s) não reconhecido(s) e tratado(s) sem desconto: "
            + ", ".join(sorted(unknown_tiers))
        )
    return customers


def load_orders(filepath: str, start_date: str = None, end_date: str = None) -> list:
    """Carrega orders.csv filtrando por período (limites inclusivos)."""
    start = parse_date(start_date, "--start-date") if start_date else None
    end = parse_date(end_date, "--end-date") if end_date else None
    if start and end and start > end:
        raise DataError(
            f"--start-date ({start.isoformat()}) é posterior a --end-date ({end.isoformat()}); "
            "o intervalo está invertido."
        )

    required = {"id", "customer_id", "value", "date"}
    orders = []
    try:
        handle = open(filepath, "r", encoding="utf-8", newline="")
    except FileNotFoundError:
        raise DataError(f"Arquivo de pedidos não encontrado: {filepath}") from None

    with handle as f:
        reader = csv.DictReader(f)
        missing = required - set(reader.fieldnames or ())
        if missing:
            raise DataError(
                f"orders.csv ({filepath}) não tem a(s) coluna(s) obrigatória(s): "
                + ", ".join(sorted(missing))
            )

        for row in reader:
            line = reader.line_num
            try:
                order_date = datetime.strptime((row["date"] or "").strip(), DATE_FORMAT).date()
            except (AttributeError, ValueError):
                raise DataError(
                    f"orders.csv linha {line}: data inválida {row.get('date')!r} "
                    "(esperado YYYY-MM-DD)."
                ) from None

            if (start and order_date < start) or (end and order_date > end):
                continue

            try:
                value = Decimal((row["value"] or "").strip())
                order_id = int((row["id"] or "").strip())
                customer_id = int((row["customer_id"] or "").strip())
            except (DecimalException, TypeError, ValueError):
                raise DataError(
                    f"orders.csv linha {line}: registro numérico inválido "
                    f"(id={row.get('id')!r}, customer_id={row.get('customer_id')!r}, "
                    f"value={row.get('value')!r})."
                ) from None

            if value < 0:
                warn(f"orders.csv linha {line}: pedido {order_id} tem valor negativo ({value}).")

            orders.append(
                {
                    "id": order_id,
                    "customer_id": customer_id,
                    "value": value,
                    "date": order_date.isoformat(),
                }
            )
    return orders


def calculate_discount(tier: str, total_spent: Decimal, order_count: int) -> Decimal:
    """Taxa de desconto aplicável.

    VIP: 10%. Regular: 5% se o total gasto for acima de R$ 500.
    Ambos exigem no mínimo 2 pedidos no período analisado.
    """
    if order_count < MIN_ORDERS_FOR_DISCOUNT:
        return Decimal("0.00")

    tier_normalized = normalize_tier(tier)
    if tier_normalized == TIER_VIP:
        return VIP_RATE
    if tier_normalized == TIER_REGULAR and total_spent > REGULAR_THRESHOLD:
        return REGULAR_RATE
    return Decimal("0.00")


def find_suspicious_orders(cust_orders: list, baseline: str = "inclusive") -> list:
    """Pedidos cujo valor supera 3x a média dos pedidos do cliente.

    baseline='inclusive' (enunciado): média de todos os pedidos do cliente.
    baseline='exclusive': média dos demais pedidos (leave-one-out).
    """
    order_count = len(cust_orders)
    if order_count == 0:
        return []

    total = sum((o["value"] for o in cust_orders), Decimal("0"))
    suspicious = []
    for order in cust_orders:
        if baseline == "exclusive":
            if order_count < 2:
                continue
            mean = (total - order["value"]) / (order_count - 1)
        else:
            mean = total / order_count

        if mean <= 0:
            continue
        if order["value"] > ANOMALY_FACTOR * mean:
            suspicious.append(
                {
                    "order_id": order["id"],
                    "date": order["date"],
                    "value": money(order["value"]),
                    "customer_mean": money(mean),
                }
            )
    return suspicious


def analyze(customers: dict, orders: list, anomaly_baseline: str = "inclusive") -> list:
    orders_by_customer = defaultdict(list)
    for order in orders:
        orders_by_customer[order["customer_id"]].append(order)

    orphan_ids = set(orders_by_customer) - set(customers)
    if orphan_ids:
        orphan_orders = sum(len(orders_by_customer[cid]) for cid in orphan_ids)
        orphan_total = sum(
            (o["value"] for cid in orphan_ids for o in orders_by_customer[cid]), Decimal("0")
        )
        warn(
            f"{orphan_orders} pedido(s) totalizando R$ {money(orphan_total):.2f} referenciam "
            f"customer_id(s) ausente(s) em customers.json {sorted(orphan_ids)} e ficaram fora "
            "do relatório."
        )

    report = []
    for cust_id in sorted(customers):
        cust_info = customers[cust_id]
        cust_orders = orders_by_customer.get(cust_id, [])
        order_count = len(cust_orders)
        total_raw = sum((o["value"] for o in cust_orders), Decimal("0"))

        discount_rate = calculate_discount(cust_info["tier"], total_raw, order_count)
        # Arredonda bruto e desconto em centavos e deriva o líquido por subtração, para
        # que (bruto - líquido) seja exatamente o desconto exibido — sem erro de 1 centavo.
        total_before = total_raw.quantize(CENTS, rounding=ROUND_HALF_UP)
        discount_value = (total_raw * discount_rate).quantize(CENTS, rounding=ROUND_HALF_UP)

        report.append(
            {
                "customer_id": cust_id,
                "nome": cust_info["name"],
                "categoria": cust_info["tier"],
                "total_pedidos": order_count,
                "total_gasto_antes_desconto": float(total_before),
                "desconto_aplicado_percentual": float(discount_rate * 100),
                "desconto_valor": float(discount_value),
                "total_gasto_apos_desconto": float(total_before - discount_value),
                "pedidos_suspeitos": find_suspicious_orders(cust_orders, anomaly_baseline),
            }
        )
    return report


def build_report(
    customers: dict,
    orders: list,
    start_date: str = None,
    end_date: str = None,
    anomaly_baseline: str = "inclusive",
) -> dict:
    """Monta o relatório final: metadados do período + a lista de clientes.

    `pedidos_analisados` não entra aqui de propósito: é a soma de
    `total_pedidos` dos clientes, e dado derivável não se duplica no contrato.
    """
    return {
        "periodo": {
            "data_inicial": parse_date(start_date, "--start-date").isoformat() if start_date else None,
            "data_final": parse_date(end_date, "--end-date").isoformat() if end_date else None,
        },
        "clientes": analyze(customers, orders, anomaly_baseline),
    }


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
        customers = load_customers(args.customers_path)
        orders = load_orders(args.orders_path, args.start_date, args.end_date)
    except DataError as exc:
        print(f"[erro] {exc}", file=sys.stderr)
        return 2

    report = build_report(
        customers, orders, args.start_date, args.end_date, args.anomaly_baseline
    )
    customers_report = report["clientes"]

    if not orders:
        period = " a ".join(filter(None, [args.start_date, args.end_date])) or "todo o arquivo"
        warn(
            f"nenhum pedido encontrado no período ({period}); o relatório foi gerado com "
            f"{len(customers_report)} cliente(s) zerado(s)."
        )

    output_json = json.dumps(report, indent=2, ensure_ascii=False)
    if args.output:
        out_dir = os.path.dirname(args.output)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json + "\n")

        suspicious = sum(len(c["pedidos_suspeitos"]) for c in customers_report)
        discounted = sum(1 for c in customers_report if c["desconto_aplicado_percentual"] > 0)
        print(
            f"Relatório gerado em '{args.output}': {len(customers_report)} cliente(s), "
            f"{len(orders)} pedido(s) no período, {discounted} com desconto, "
            f"{suspicious} pedido(s) suspeito(s)."
        )
    else:
        print(output_json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
