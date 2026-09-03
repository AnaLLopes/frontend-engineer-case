"""Suíte de testes das regras de negócio do analisador de pedidos.

Cobre: consolidação por customer_id, as três regras de desconto (VIP, Regular
acima de R$ 500 e mínimo de 2 pedidos), a detecção de pedidos suspeitos (> 3x a
média do cliente), o filtro de período por linha de comando, o arredondamento em
centavos e o contrato do JSON consumido pelo front-end Next.js.
"""

import csv
import json
import os
import re
from decimal import Decimal

import pytest

from backend.analyzer import (
    DataError,
    analyze,
    build_report,
    calculate_discount,
    find_suspicious_orders,
    load_customers,
    load_orders,
    main,
    normalize_tier,
    parse_args,
)

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
TS_TYPES_PATH = os.path.join(REPO_ROOT, "frontend", "types", "index.ts")
REAL_ORDERS = os.path.join(REPO_ROOT, "backend", "orders.csv")
REAL_CUSTOMERS = os.path.join(REPO_ROOT, "backend", "customers.json")


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #

def make_order(order_id, customer_id, value, date="2025-01-10"):
    return {
        "id": order_id,
        "customer_id": customer_id,
        "value": Decimal(str(value)),
        "date": date,
    }


def write_csv(path, rows, header=("id", "customer_id", "value", "date")):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if header:
            writer.writerow(header)
        writer.writerows(rows)
    return str(path)


def write_customers(path, customers):
    path.write_text(json.dumps(customers), encoding="utf-8")
    return str(path)


def by_id(report, customer_id):
    return next(item for item in report if item["customer_id"] == customer_id)


@pytest.fixture
def customers():
    return {
        1: {"id": 1, "name": "Alice", "tier": "VIP"},
        2: {"id": 2, "name": "Bob", "tier": "Regular"},
        3: {"id": 3, "name": "Carol", "tier": "Regular"},
        4: {"id": 4, "name": "Dave", "tier": "VIP"},
    }


# --------------------------------------------------------------------------- #
# Regra 1 — consolidação por customer_id                                      #
# --------------------------------------------------------------------------- #

def test_consolida_pedidos_por_customer_id(customers):
    orders = [
        make_order(1, 1, "100.00"),
        make_order(2, 1, "200.00"),
        make_order(3, 2, "50.00"),
    ]
    report = analyze(customers, orders)

    assert by_id(report, 1)["total_pedidos"] == 2
    assert by_id(report, 1)["total_gasto_antes_desconto"] == 300.00
    assert by_id(report, 2)["total_pedidos"] == 1
    assert by_id(report, 2)["total_gasto_antes_desconto"] == 50.00


def test_relatorio_ordenado_por_customer_id_e_cobre_toda_a_base(customers):
    report = analyze(customers, [make_order(1, 3, "10.00")])
    assert [item["customer_id"] for item in report] == [1, 2, 3, 4]


def test_cliente_sem_pedidos_aparece_zerado(customers):
    report = analyze(customers, [make_order(1, 1, "100.00")])
    dave = by_id(report, 4)

    assert dave["total_pedidos"] == 0
    assert dave["total_gasto_antes_desconto"] == 0.0
    assert dave["total_gasto_apos_desconto"] == 0.0
    assert dave["desconto_aplicado_percentual"] == 0.0
    assert dave["desconto_valor"] == 0.0
    assert dave["pedidos_suspeitos"] == []


def test_pedido_orfao_e_excluido_e_avisado(customers, capsys):
    orders = [make_order(1, 1, "100.00"), make_order(2, 999, "5000.00")]
    report = analyze(customers, orders)

    assert sum(item["total_gasto_antes_desconto"] for item in report) == 100.00
    assert "999" in capsys.readouterr().err


def test_nome_e_categoria_vem_do_cadastro_de_clientes(customers):
    report = analyze(customers, [make_order(1, 2, "10.00")])
    assert by_id(report, 2)["nome"] == "Bob"
    assert by_id(report, 2)["categoria"] == "Regular"


# --------------------------------------------------------------------------- #
# Regra 2 — descontos                                                         #
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    "tier, total, count, expected",
    [
        # 2a) VIP: 10% independente do valor gasto.
        ("VIP", "1000.00", 2, "0.10"),
        ("VIP", "1.00", 2, "0.10"),
        ("VIP", "10000.00", 50, "0.10"),
        # 2b) Regular: 5% somente acima de R$ 500 (limiar exclusivo).
        ("Regular", "500.01", 2, "0.05"),
        ("Regular", "1000.00", 2, "0.05"),
        ("Regular", "500.00", 2, "0.00"),
        ("Regular", "499.99", 2, "0.00"),
        # 2c) Mínimo de 2 pedidos no período, para os dois tiers.
        ("VIP", "1000.00", 1, "0.00"),
        ("VIP", "1000.00", 0, "0.00"),
        ("Regular", "1000.00", 1, "0.00"),
        ("Regular", "1000.00", 0, "0.00"),
    ],
)
def test_taxa_de_desconto_por_tier_total_e_quantidade(tier, total, count, expected):
    assert calculate_discount(tier, Decimal(total), count) == Decimal(expected)


@pytest.mark.parametrize("tier", ["vip", "VIP", " Vip ", "regular", "REGULAR", " Regular "])
def test_tier_e_reconhecido_independente_de_caixa_e_espacos(tier):
    rate = calculate_discount(tier, Decimal("1000.00"), 2)
    assert rate == (Decimal("0.10") if "vip" in tier.strip().lower() else Decimal("0.05"))


@pytest.mark.parametrize("tier", ["Premium", "", None, "gold"])
def test_tier_desconhecido_nao_recebe_desconto(tier):
    assert calculate_discount(tier, Decimal("10000.00"), 10) == Decimal("0.00")


def test_desconto_vip_aplicado_no_relatorio(customers):
    report = analyze(customers, [make_order(1, 1, "400.00"), make_order(2, 1, "600.00")])
    alice = by_id(report, 1)

    assert alice["desconto_aplicado_percentual"] == 10.0
    assert alice["total_gasto_antes_desconto"] == 1000.00
    assert alice["desconto_valor"] == 100.00
    assert alice["total_gasto_apos_desconto"] == 900.00


def test_desconto_regular_usa_o_total_bruto_como_base_do_limiar(customers):
    """R$ 500,01 bruto entra na regra; o limiar é avaliado antes do desconto."""
    report = analyze(customers, [make_order(1, 2, "250.00"), make_order(2, 2, "250.01")])
    bob = by_id(report, 2)

    assert bob["total_gasto_antes_desconto"] == 500.01
    assert bob["desconto_aplicado_percentual"] == 5.0
    assert bob["total_gasto_apos_desconto"] == 475.01


def test_regular_no_limiar_exato_de_500_nao_tem_desconto(customers):
    report = analyze(customers, [make_order(1, 2, "250.00"), make_order(2, 2, "250.00")])
    bob = by_id(report, 2)

    assert bob["total_gasto_antes_desconto"] == 500.00
    assert bob["desconto_aplicado_percentual"] == 0.0
    assert bob["total_gasto_apos_desconto"] == 500.00


def test_pedido_unico_de_alto_valor_nao_gera_desconto(customers):
    report = analyze(customers, [make_order(1, 1, "9999.00")])
    alice = by_id(report, 1)

    assert alice["total_pedidos"] == 1
    assert alice["desconto_aplicado_percentual"] == 0.0
    assert alice["total_gasto_apos_desconto"] == 9999.00


def test_minimo_de_pedidos_considera_apenas_o_periodo_filtrado(tmp_path, customers):
    """Cliente com 2 pedidos no arquivo, mas 1 só no período, perde o desconto."""
    orders_path = write_csv(
        tmp_path / "orders.csv",
        [["1", "1", "600.00", "2025-01-05"], ["2", "1", "600.00", "2025-02-05"]],
    )
    dentro = analyze(customers, load_orders(orders_path, "2025-01-01", "2025-02-28"))
    parcial = analyze(customers, load_orders(orders_path, "2025-01-01", "2025-01-31"))

    assert by_id(dentro, 1)["desconto_aplicado_percentual"] == 10.0
    assert by_id(parcial, 1)["desconto_aplicado_percentual"] == 0.0
    assert by_id(parcial, 1)["total_pedidos"] == 1


# --------------------------------------------------------------------------- #
# Regra 3 — pedidos suspeitos (> 3x a média do cliente)                       #
# --------------------------------------------------------------------------- #

def test_marca_pedido_acima_de_tres_vezes_a_media_do_cliente():
    # Total 1000, média 250; o limiar é 750 e o pedido de 800 o supera.
    orders = [
        make_order(1, 1, "100.00"),
        make_order(2, 1, "50.00"),
        make_order(3, 1, "50.00"),
        make_order(4, 1, "800.00"),
    ]
    suspicious = find_suspicious_orders(orders)

    assert [item["order_id"] for item in suspicious] == [4]
    assert suspicious[0]["value"] == 800.00
    assert suspicious[0]["customer_mean"] == 250.00
    assert suspicious[0]["date"] == "2025-01-10"


def test_limiar_de_tres_vezes_e_exclusivo():
    """Exatamente 3x a média não é suspeito; um centavo acima é."""
    no_limiar = [make_order(1, 1, "300.00")] + [make_order(i, 1, "100.00") for i in range(2, 4)]
    # Total 500, média 166.67 -> 3x = 500.00; nenhum pedido supera.
    assert find_suspicious_orders(no_limiar) == []

    exato = [make_order(1, 1, "600.00"), *[make_order(i, 1, "100.00") for i in range(2, 7)]]
    # Total 1100, média 183.33...; 3x = 550.0 e 600 > 550 -> suspeito.
    assert [o["order_id"] for o in find_suspicious_orders(exato)] == [1]


def test_pedidos_de_valores_iguais_nunca_sao_suspeitos():
    orders = [make_order(i, 1, "500.00") for i in range(1, 6)]
    assert find_suspicious_orders(orders) == []


def test_cliente_com_um_unico_pedido_nunca_e_suspeito():
    assert find_suspicious_orders([make_order(1, 1, "10000.00")]) == []


def test_cliente_sem_pedidos_nao_gera_suspeitos():
    assert find_suspicious_orders([]) == []


def test_media_inclusiva_exige_ao_menos_quatro_pedidos_para_flagar():
    """Com a média incluindo o próprio pedido, n<=3 é matematicamente imune."""
    for n in (2, 3):
        orders = [make_order(1, 1, "10000.00")] + [make_order(i, 1, "0.01") for i in range(2, n + 1)]
        assert find_suspicious_orders(orders) == [], f"n={n} não deveria flagar"


def test_baseline_exclusive_usa_media_dos_demais_pedidos():
    """A base leave-one-out é opcional e bem mais sensível que a do enunciado."""
    orders = [make_order(1, 1, "120.00"), make_order(2, 1, "180.00"), make_order(3, 1, "1000.00")]

    assert find_suspicious_orders(orders, baseline="inclusive") == []

    exclusive = find_suspicious_orders(orders, baseline="exclusive")
    assert [item["order_id"] for item in exclusive] == [3]
    assert exclusive[0]["customer_mean"] == 150.00  # média de 120 e 180


def test_multiplos_pedidos_suspeitos_do_mesmo_cliente():
    orders = [make_order(i, 1, "10.00") for i in range(1, 21)]
    orders += [make_order(21, 1, "900.00"), make_order(22, 1, "1000.00")]
    # Total 2100 em 22 pedidos, média 95.45; 3x = 286.36.
    assert [item["order_id"] for item in find_suspicious_orders(orders)] == [21, 22]


def test_suspeitos_nao_alteram_o_calculo_do_desconto(customers):
    orders = [make_order(1, 1, "100.00"), make_order(2, 1, "50.00"),
              make_order(3, 1, "50.00"), make_order(4, 1, "800.00")]
    alice = by_id(analyze(customers, orders), 1)

    assert len(alice["pedidos_suspeitos"]) == 1
    assert alice["total_gasto_antes_desconto"] == 1000.00
    assert alice["total_gasto_apos_desconto"] == 900.00


def test_media_do_cliente_e_isolada_por_cliente(customers):
    orders = [
        make_order(1, 1, "10.00"), make_order(2, 1, "10.00"),
        make_order(3, 1, "10.00"), make_order(4, 1, "500.00"),
        make_order(5, 2, "500.00"), make_order(6, 2, "500.00"),
    ]
    report = analyze(customers, orders)

    assert len(by_id(report, 1)["pedidos_suspeitos"]) == 1
    assert by_id(report, 2)["pedidos_suspeitos"] == []


# --------------------------------------------------------------------------- #
# Regra 5 — filtro de período via linha de comando                            #
# --------------------------------------------------------------------------- #

@pytest.fixture
def orders_csv(tmp_path):
    return write_csv(
        tmp_path / "orders.csv",
        [
            ["1", "10", "100.00", "2025-01-01"],
            ["2", "10", "200.00", "2025-01-15"],
            ["3", "10", "300.00", "2025-01-31"],
            ["4", "10", "400.00", "2025-02-01"],
        ],
    )


def test_filtro_de_periodo_tem_limites_inclusivos(orders_csv):
    assert [o["id"] for o in load_orders(orders_csv, "2025-01-01", "2025-01-31")] == [1, 2, 3]
    assert [o["id"] for o in load_orders(orders_csv, "2025-01-15", "2025-01-15")] == [2]


def test_filtro_aceita_apenas_um_dos_limites(orders_csv):
    assert [o["id"] for o in load_orders(orders_csv, "2025-01-31", None)] == [3, 4]
    assert [o["id"] for o in load_orders(orders_csv, None, "2025-01-01")] == [1]


def test_sem_filtro_carrega_todos_os_pedidos(orders_csv):
    assert len(load_orders(orders_csv)) == 4


def test_periodo_sem_nenhum_pedido_retorna_lista_vazia(orders_csv):
    assert load_orders(orders_csv, "2025-06-01", "2025-06-30") == []


def test_periodo_vazio_gera_relatorio_zerado_sem_quebrar(customers, orders_csv):
    report = analyze(customers, load_orders(orders_csv, "2025-06-01", "2025-06-30"))

    assert len(report) == len(customers)
    assert all(item["total_pedidos"] == 0 for item in report)
    assert all(item["total_gasto_antes_desconto"] == 0.0 for item in report)
    assert all(item["desconto_aplicado_percentual"] == 0.0 for item in report)
    assert all(item["pedidos_suspeitos"] == [] for item in report)


def test_intervalo_invertido_e_rejeitado(orders_csv):
    with pytest.raises(DataError, match="invertido"):
        load_orders(orders_csv, "2025-03-01", "2025-01-01")


@pytest.mark.parametrize("bad", ["13/01/2025", "2025-13-01", "ontem", "2025-01-32", "2025-02-30"])
def test_data_invalida_na_linha_de_comando_e_rejeitada(orders_csv, bad):
    with pytest.raises(DataError, match="YYYY-MM-DD"):
        load_orders(orders_csv, bad, None)


def test_data_em_branco_equivale_a_ausencia_de_filtro(orders_csv):
    assert len(load_orders(orders_csv, "", "")) == 4


def test_parse_args_le_o_intervalo_de_datas():
    args = parse_args(["--start-date", "2025-01-01", "--end-date", "2025-01-31"])
    assert args.start_date == "2025-01-01"
    assert args.end_date == "2025-01-31"
    assert args.anomaly_baseline == "inclusive"


def test_parse_args_usa_o_diretorio_backend_como_padrao():
    args = parse_args([])
    assert args.customers_path.endswith(os.path.join("backend", "customers.json"))
    assert args.orders_path.endswith(os.path.join("backend", "orders.csv"))
    assert args.output is None


# --------------------------------------------------------------------------- #
# Leitura de arquivos e robustez de dados                                     #
# --------------------------------------------------------------------------- #

def test_load_customers_indexa_por_id_inteiro_e_canoniza_tier(tmp_path):
    path = write_customers(
        tmp_path / "customers.json",
        [{"id": "7", "name": "Sete", "tier": " vip "}, {"id": 8, "name": "Oito", "tier": "regular"}],
    )
    loaded = load_customers(path)

    assert set(loaded) == {7, 8}
    assert loaded[7]["tier"] == "VIP"
    assert loaded[8]["tier"] == "Regular"


def test_load_customers_avisa_sobre_tier_desconhecido(tmp_path, capsys):
    path = write_customers(tmp_path / "c.json", [{"id": 1, "name": "X", "tier": "Premium"}])
    load_customers(path)
    assert "Premium" in capsys.readouterr().err


def test_load_customers_avisa_sobre_id_duplicado(tmp_path, capsys):
    path = write_customers(
        tmp_path / "c.json",
        [{"id": 1, "name": "Primeiro", "tier": "VIP"}, {"id": 1, "name": "Segundo", "tier": "Regular"}],
    )
    loaded = load_customers(path)

    assert loaded[1]["name"] == "Segundo"
    assert "duplicado" in capsys.readouterr().err


def test_arquivos_inexistentes_geram_erro_claro(tmp_path):
    with pytest.raises(DataError, match="não encontrado"):
        load_customers(str(tmp_path / "nao_existe.json"))
    with pytest.raises(DataError, match="não encontrado"):
        load_orders(str(tmp_path / "nao_existe.csv"))


def test_json_de_clientes_malformado_gera_erro_claro(tmp_path):
    path = tmp_path / "c.json"
    path.write_text("{ nao é json", encoding="utf-8")
    with pytest.raises(DataError, match="inválido"):
        load_customers(str(path))


def test_csv_sem_coluna_obrigatoria_gera_erro_claro(tmp_path):
    path = write_csv(tmp_path / "o.csv", [["1", "1", "10.00"]], header=("id", "customer_id", "value"))
    with pytest.raises(DataError, match="date"):
        load_orders(path)


def test_csv_com_valor_malformado_aponta_a_linha(tmp_path):
    path = write_csv(
        tmp_path / "o.csv",
        [["1", "1", "10.00", "2025-01-01"], ["2", "1", "abc", "2025-01-02"]],
    )
    with pytest.raises(DataError, match="linha 3"):
        load_orders(path)


def test_csv_com_data_malformada_aponta_a_linha(tmp_path):
    path = write_csv(tmp_path / "o.csv", [["1", "1", "10.00", "01-01-2025"]])
    with pytest.raises(DataError, match="linha 2"):
        load_orders(path)


def test_csv_vazio_retorna_lista_vazia(tmp_path):
    path = write_csv(tmp_path / "o.csv", [])
    assert load_orders(path) == []


def test_valor_negativo_e_carregado_com_aviso(tmp_path, capsys):
    path = write_csv(tmp_path / "o.csv", [["1", "1", "-10.00", "2025-01-01"]])
    orders = load_orders(path)

    assert orders[0]["value"] == Decimal("-10.00")
    assert "negativo" in capsys.readouterr().err


def test_normalize_tier_e_idempotente():
    assert normalize_tier(normalize_tier(" vip ")) == "VIP"
    assert normalize_tier(None) == ""


# --------------------------------------------------------------------------- #
# Precisão monetária                                                          #
# --------------------------------------------------------------------------- #

def test_valores_sao_arredondados_para_centavos(customers):
    # 33.333 * 3 = 99.999 -> 100.00
    orders = [make_order(i, 1, "33.333") for i in range(1, 4)]
    alice = by_id(analyze(customers, orders), 1)

    assert alice["total_gasto_antes_desconto"] == 100.00
    assert alice["desconto_valor"] == 10.00
    assert alice["total_gasto_apos_desconto"] == 90.00


def test_arredondamento_comercial_meio_para_cima(customers):
    # 0.005 arredonda para 0.01 (ROUND_HALF_UP), não para 0.00 (banker's rounding).
    orders = [make_order(1, 1, "0.005"), make_order(2, 1, "0.00")]
    assert by_id(analyze(customers, orders), 1)["total_gasto_antes_desconto"] == 0.01


def test_bruto_menos_liquido_e_exatamente_o_desconto(customers):
    """Sem divergência de 1 centavo entre os três campos monetários."""
    orders = [make_order(1, 2, "15265.90"), make_order(2, 2, "0.00")]
    bob = by_id(analyze(customers, orders), 2)

    assert bob["desconto_valor"] == 763.30  # 5% de 15265.90 = 763.295 -> 763.30
    assert round(bob["total_gasto_antes_desconto"] - bob["total_gasto_apos_desconto"], 2) == \
        bob["desconto_valor"]


def test_consistencia_monetaria_em_toda_a_base(customers):
    orders = [make_order(i, (i % 4) + 1, f"{i}.{i % 100:02d}") for i in range(1, 61)]
    for item in analyze(customers, orders):
        assert round(
            item["total_gasto_antes_desconto"] - item["desconto_valor"], 2
        ) == item["total_gasto_apos_desconto"]


def test_somas_grandes_nao_perdem_precisao(customers):
    orders = [make_order(i, 1, "0.10") for i in range(1, 31)]
    assert by_id(analyze(customers, orders), 1)["total_gasto_antes_desconto"] == 3.00


# --------------------------------------------------------------------------- #
# Regra 4 — contrato do relatório consumido pelo front-end                    #
# --------------------------------------------------------------------------- #

CUSTOMER_KEYS = {
    "customer_id",
    "nome",
    "categoria",
    "total_pedidos",
    "total_gasto_antes_desconto",
    "desconto_aplicado_percentual",
    "desconto_valor",
    "total_gasto_apos_desconto",
    "pedidos_suspeitos",
}
SUSPICIOUS_KEYS = {"order_id", "date", "value", "customer_mean"}


def test_relatorio_expoe_exatamente_os_campos_do_contrato(customers):
    orders = [make_order(i, 1, "10.00") for i in range(1, 5)] + [make_order(5, 1, "500.00")]
    for item in analyze(customers, orders):
        assert set(item) == CUSTOMER_KEYS
        for suspicious in item["pedidos_suspeitos"]:
            assert set(suspicious) == SUSPICIOUS_KEYS


def test_tipos_do_relatorio_sao_serializaveis_e_corretos(customers):
    orders = [make_order(i, 1, "10.00") for i in range(1, 5)] + [make_order(5, 1, "500.00")]
    report = analyze(customers, orders)

    json.dumps(report)  # não deve levantar (nenhum Decimal escapa da serialização)
    for item in report:
        assert isinstance(item["customer_id"], int)
        assert isinstance(item["nome"], str)
        assert item["categoria"] in {"VIP", "Regular"}
        assert isinstance(item["total_pedidos"], int)
        assert isinstance(item["total_gasto_antes_desconto"], float)
        assert isinstance(item["desconto_aplicado_percentual"], float)
        assert isinstance(item["total_gasto_apos_desconto"], float)
        assert isinstance(item["pedidos_suspeitos"], list)
        for suspicious in item["pedidos_suspeitos"]:
            assert isinstance(suspicious["order_id"], int)
            assert isinstance(suspicious["value"], float)
            assert isinstance(suspicious["customer_mean"], float)
            assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", suspicious["date"])


def test_envelope_tem_periodo_e_clientes(customers):
    report = build_report(customers, [make_order(1, 1, "10.00")], "2025-01-01", "2025-01-31")

    assert set(report) == {"periodo", "clientes"}
    assert report["periodo"] == {"data_inicial": "2025-01-01", "data_final": "2025-01-31"}
    assert isinstance(report["clientes"], list)
    assert len(report["clientes"]) == len(customers)


def test_envelope_sem_filtro_registra_periodo_aberto(customers):
    report = build_report(customers, [])
    assert report["periodo"] == {"data_inicial": None, "data_final": None}


@pytest.mark.parametrize(
    "start, end, expected",
    [
        ("2025-01-01", None, {"data_inicial": "2025-01-01", "data_final": None}),
        (None, "2025-01-31", {"data_inicial": None, "data_final": "2025-01-31"}),
        (" 2025-01-05 ", "2025-01-05", {"data_inicial": "2025-01-05", "data_final": "2025-01-05"}),
    ],
)
def test_envelope_normaliza_os_limites_do_periodo(customers, start, end, expected):
    assert build_report(customers, [], start, end)["periodo"] == expected


def test_envelope_rejeita_data_invalida(customers):
    with pytest.raises(DataError, match="YYYY-MM-DD"):
        build_report(customers, [], "01/01/2025", None)


def test_pedidos_analisados_e_derivavel_do_envelope(customers):
    """A soma de `total_pedidos` reconstrói o volume, então não se duplica no contrato."""
    orders = [make_order(1, 1, "10.00"), make_order(2, 2, "20.00"), make_order(3, 2, "30.00")]
    report = build_report(customers, orders)

    assert sum(item["total_pedidos"] for item in report["clientes"]) == len(orders)


@pytest.mark.skipif(not os.path.exists(TS_TYPES_PATH), reason="front-end ausente")
def test_contrato_python_bate_com_as_interfaces_typescript():
    """Falha se o relatório e frontend/types/index.ts saírem de sincronia."""
    source = open(TS_TYPES_PATH, encoding="utf-8").read()

    def fields(interface):
        body = re.search(rf"interface\s+{interface}\s*\{{(.*?)\}}", source, re.S).group(1)
        return set(re.findall(r"^\s*(\w+)\s*[?]?\s*:", body, re.M))

    assert fields("CustomerReport") == CUSTOMER_KEYS
    assert fields("SuspiciousOrder") == SUSPICIOUS_KEYS
    assert fields("AnalysisReport") == {"periodo", "clientes"}
    assert fields("ReportPeriod") == {"data_inicial", "data_final"}


# --------------------------------------------------------------------------- #
# CLI (main): códigos de saída, escrita do arquivo e mensagens                #
# --------------------------------------------------------------------------- #

@pytest.fixture
def cli_inputs(tmp_path):
    customers_path = write_customers(
        tmp_path / "customers.json",
        [{"id": 1, "name": "Alice", "tier": "VIP"}, {"id": 2, "name": "Bob", "tier": "Regular"}],
    )
    orders_path = write_csv(
        tmp_path / "orders.csv",
        [
            ["1", "1", "100.00", "2025-01-05"],
            ["2", "1", "250.00", "2025-01-08"],
            ["3", "2", "150.00", "2025-01-10"],
            ["4", "2", "150.00", "2025-02-12"],
        ],
    )
    return customers_path, orders_path


def test_main_grava_o_json_no_caminho_pedido(tmp_path, cli_inputs):
    customers_path, orders_path = cli_inputs
    output = tmp_path / "nested" / "public" / "report.json"

    exit_code = main(
        ["--customers-path", customers_path, "--orders-path", orders_path, "--output", str(output)]
    )

    assert exit_code == 0
    payload = json.loads(output.read_text(encoding="utf-8"))
    clientes = payload["clientes"]
    assert [item["customer_id"] for item in clientes] == [1, 2]
    assert clientes[0]["categoria"] == "VIP"
    assert clientes[0]["desconto_aplicado_percentual"] == 10.0
    assert clientes[0]["total_gasto_apos_desconto"] == 315.00
    assert clientes[1]["total_gasto_apos_desconto"] == 300.00  # Regular <= 500: sem desconto


def test_main_cria_diretorios_inexistentes(tmp_path, cli_inputs):
    customers_path, orders_path = cli_inputs
    output = tmp_path / "a" / "b" / "c" / "report.json"

    assert main(["--customers-path", customers_path, "--orders-path", orders_path,
                 "--output", str(output)]) == 0
    assert output.exists()


def test_main_sem_output_imprime_json_no_stdout(cli_inputs, capsys):
    customers_path, orders_path = cli_inputs
    assert main(["--customers-path", customers_path, "--orders-path", orders_path]) == 0

    payload = json.loads(capsys.readouterr().out)
    assert len(payload["clientes"]) == 2


def test_main_aplica_o_filtro_de_datas_da_linha_de_comando(tmp_path, cli_inputs):
    customers_path, orders_path = cli_inputs
    output = tmp_path / "report.json"

    main(["--customers-path", customers_path, "--orders-path", orders_path,
          "--output", str(output), "--start-date", "2025-01-01", "--end-date", "2025-01-31"])

    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["periodo"] == {"data_inicial": "2025-01-01", "data_final": "2025-01-31"}
    bob = next(item for item in payload["clientes"] if item["customer_id"] == 2)
    assert bob["total_pedidos"] == 1  # o pedido de fevereiro ficou fora
    assert bob["desconto_aplicado_percentual"] == 0.0


def test_main_avisa_quando_o_periodo_nao_tem_pedidos(tmp_path, cli_inputs, capsys):
    customers_path, orders_path = cli_inputs
    output = tmp_path / "report.json"

    assert main(["--customers-path", customers_path, "--orders-path", orders_path,
                 "--output", str(output), "--start-date", "2030-01-01"]) == 0

    assert "nenhum pedido" in capsys.readouterr().err
    assert len(json.loads(output.read_text(encoding="utf-8"))["clientes"]) == 2


def test_main_retorna_codigo_de_erro_em_data_invalida(cli_inputs, capsys):
    customers_path, orders_path = cli_inputs
    exit_code = main(["--customers-path", customers_path, "--orders-path", orders_path,
                      "--start-date", "01/01/2025"])

    assert exit_code == 2
    assert "[erro]" in capsys.readouterr().err


def test_main_retorna_codigo_de_erro_em_arquivo_ausente(tmp_path, capsys):
    exit_code = main(["--customers-path", str(tmp_path / "x.json"),
                      "--orders-path", str(tmp_path / "y.csv")])

    assert exit_code == 2
    assert "não encontrado" in capsys.readouterr().err


def test_main_aceita_baseline_exclusive(tmp_path):
    customers_path = write_customers(tmp_path / "c.json", [{"id": 1, "name": "A", "tier": "VIP"}])
    orders_path = write_csv(
        tmp_path / "o.csv",
        [["1", "1", "120.00", "2025-01-01"], ["2", "1", "180.00", "2025-01-02"],
         ["3", "1", "1000.00", "2025-01-03"]],
    )
    output = tmp_path / "r.json"

    main(["--customers-path", customers_path, "--orders-path", orders_path,
          "--output", str(output), "--anomaly-baseline", "exclusive"])
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert len(payload["clientes"][0]["pedidos_suspeitos"]) == 1

    main(["--customers-path", customers_path, "--orders-path", orders_path, "--output", str(output)])
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["clientes"][0]["pedidos_suspeitos"] == []


# --------------------------------------------------------------------------- #
# Integração com o dataset real do desafio                                    #
# --------------------------------------------------------------------------- #

@pytest.mark.skipif(
    not (os.path.exists(REAL_ORDERS) and os.path.exists(REAL_CUSTOMERS)),
    reason="dataset do desafio ausente",
)
def test_dataset_do_desafio_produz_relatorio_coerente():
    customers = load_customers(REAL_CUSTOMERS)
    orders = load_orders(REAL_ORDERS)
    report = analyze(customers, orders)

    assert len(customers) == 50
    assert len(orders) == 1000
    assert len(report) == 50

    total_csv = sum(order["value"] for order in orders)
    total_report = sum(Decimal(str(item["total_gasto_antes_desconto"])) for item in report)
    assert total_report == total_csv  # nenhum pedido perdido na consolidação

    for item in report:
        assert item["categoria"] in {"VIP", "Regular"}
        expected = 10.0 if item["categoria"] == "VIP" else (
            5.0 if item["total_gasto_antes_desconto"] > 500 else 0.0
        )
        assert item["desconto_aplicado_percentual"] == (
            expected if item["total_pedidos"] >= 2 else 0.0
        )


@pytest.mark.skipif(
    not (os.path.exists(REAL_ORDERS) and os.path.exists(REAL_CUSTOMERS)),
    reason="dataset do desafio ausente",
)
def test_periodo_curto_no_dataset_real_nao_quebra():
    customers = load_customers(REAL_CUSTOMERS)
    report = analyze(customers, load_orders(REAL_ORDERS, "2025-03-01", "2025-03-02"))

    assert len(report) == 50
    assert sum(item["total_pedidos"] for item in report) == 27
    # Em 27 pedidos espalhados por 20 clientes, a média inclusiva não flagra nada.
    assert sum(len(item["pedidos_suspeitos"]) for item in report) == 0
