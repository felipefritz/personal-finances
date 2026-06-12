"""
Initial seed data for development and demo purposes.
Creates: categories, accounts, transactions, fixed expenses, savings goals, budgets.
"""
from datetime import date, datetime, timedelta
from random import choice, randint, uniform
from sqlmodel import Session, select

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.fixed_expense import FixedExpense
from app.models.savings_goal import SavingsGoal
from app.models.budget import Budget


CATEGORIES = [
    {"name": "Vivienda", "color": "#5C6BC0", "icon": "home", "is_system": True, "subcategories": [
        "Dividendo", "Arriendo", "Contribuciones", "Gastos comunes",
    ]},
    {"name": "Servicios", "color": "#29B6F6", "icon": "bolt", "is_system": True, "subcategories": [
        "Electricidad", "Agua", "Internet", "Gas", "Celular",
    ]},
    {"name": "Alimentación", "color": "#66BB6A", "icon": "restaurant", "is_system": True, "subcategories": [
        "Supermercado", "Restaurantes", "Delivery", "Panadería",
    ]},
    {"name": "Transporte", "color": "#FFA726", "icon": "directions_car", "is_system": True, "subcategories": [
        "Combustible", "Peajes/TAG", "Transporte público", "Taxi/Rideshare", "Mantención",
    ]},
    {"name": "Educación", "color": "#AB47BC", "icon": "school", "is_system": True, "subcategories": [
        "Colegio", "Universidad", "Útiles", "Cursos online",
    ]},
    {"name": "Salud", "color": "#EF5350", "icon": "favorite", "is_system": True, "subcategories": [
        "Médico", "Dentista", "Farmacia", "Isapre/Fonasa",
    ]},
    {"name": "Mascotas", "color": "#8D6E63", "icon": "pets", "is_system": True, "subcategories": []},
    {"name": "Suscripciones", "color": "#EC407A", "icon": "subscriptions", "is_system": True, "subcategories": [
        "Streaming video", "Streaming audio", "Cloud/Productividad", "Fitness",
    ]},
    {"name": "Transferencias", "color": "#78909C", "icon": "swap_horiz", "is_system": True, "subcategories": []},
    {"name": "Créditos", "color": "#FF7043", "icon": "credit_card", "is_system": True, "subcategories": []},
    {"name": "Compras", "color": "#26C6DA", "icon": "shopping_bag", "is_system": True, "subcategories": [
        "Vestuario/Calzado", "Tecnología", "Online", "Hogar",
    ]},
    {"name": "Ocio", "color": "#FFCA28", "icon": "sports_esports", "is_system": True, "subcategories": [
        "Entretenimiento", "Juegos", "Deporte",
    ]},
    {"name": "Viajes", "color": "#26A69A", "icon": "flight", "is_system": True, "subcategories": []},
    {"name": "Gastos hormiga", "color": "#BDBDBD", "icon": "coffee", "is_system": True, "subcategories": []},
    {"name": "Ingresos", "color": "#4CAF50", "icon": "trending_up", "is_system": True, "subcategories": [
        "Sueldo", "Freelance", "Inversiones", "Arriendo recibido", "Otros ingresos",
    ]},
    {"name": "Otros", "color": "#9E9E9E", "icon": "more_horiz", "is_system": True, "subcategories": []},
]


def seed_all(session: Session) -> None:
    # Skip if already seeded
    existing_count = len(session.exec(select(Category)).all())
    if existing_count > 0:
        return

    print("🌱 Seeding initial data...")

    # --- Categories ---
    cat_map: dict[str, int] = {}
    for cat_def in CATEGORIES:
        cat = Category(
            name=cat_def["name"],
            color=cat_def["color"],
            icon=cat_def["icon"],
            is_system=cat_def["is_system"],
        )
        session.add(cat)
        session.flush()
        cat_map[cat_def["name"]] = cat.id

        for sub_name in cat_def.get("subcategories", []):
            sub = Category(name=sub_name, parent_id=cat.id, is_system=True)
            session.add(sub)
            session.flush()
            cat_map[sub_name] = sub.id

    # --- Accounts ---
    account1 = Account(
        name="Cuenta Corriente BancoEstado",
        bank="BancoEstado",
        account_type="corriente",
        balance=1_850_000,
        currency="CLP",
        is_active=True,
        source="manual",
    )
    account2 = Account(
        name="Cuenta Vista Banco Santander",
        bank="Santander",
        account_type="vista",
        balance=320_000,
        currency="CLP",
        is_active=True,
        source="manual",
    )
    account3 = Account(
        name="Tarjeta de Crédito Falabella",
        bank="Falabella",
        account_type="tarjeta_credito",
        balance=-450_000,
        currency="CLP",
        is_active=True,
        source="manual",
    )
    session.add_all([account1, account2, account3])
    session.flush()

    # --- Transactions (30 demo transactions for current and previous month) ---
    today = date.today()
    current_month_start = today.replace(day=1)

    transactions_data = [
        # Current month
        {"date": today.replace(day=1), "description": "TRANSFERENCIA EMPRESA S.A. - SUELDO", "amount": 1_500_000, "type": "income", "cat": "Sueldo", "account": account1},
        {"date": today.replace(day=3), "description": "JUMBO ARAUCO COMPRA", "amount": -67_850, "type": "expense", "cat": "Supermercado", "account": account1},
        {"date": today.replace(day=4), "description": "UBER VIAJE", "amount": -3_200, "type": "expense", "cat": "Taxi/Rideshare", "account": account1, "is_ant": True},
        {"date": today.replace(day=5), "description": "NETFLIX.COM SUSCRIPCION", "amount": -8_990, "type": "expense", "cat": "Streaming video", "account": account2},
        {"date": today.replace(day=5), "description": "SPOTIFY PREMIUM", "amount": -4_490, "type": "expense", "cat": "Streaming audio", "account": account2},
        {"date": today.replace(day=6), "description": "DIVIDENDO HIPOTECARIO BCI", "amount": -420_000, "type": "expense", "cat": "Dividendo", "account": account1, "is_fixed": True},
        {"date": today.replace(day=7), "description": "RESTAURANTE EL PILAR", "amount": -28_500, "type": "expense", "cat": "Restaurantes", "account": account1},
        {"date": today.replace(day=8), "description": "COPEC BENCINA", "amount": -45_000, "type": "expense", "cat": "Combustible", "account": account1},
        {"date": today.replace(day=9), "description": "CAFE STARBUCKS", "amount": -3_800, "type": "expense", "cat": "Gastos hormiga", "account": account1, "is_ant": True},
        {"date": today.replace(day=10), "description": "COLEGIO SAN PEDRO MENSUALIDAD", "amount": -95_000, "type": "expense", "cat": "Colegio", "account": account1, "is_fixed": True},
        {"date": today.replace(day=11), "description": "ENTEL CELULAR", "amount": -19_990, "type": "expense", "cat": "Celular", "account": account1, "is_fixed": True},
        {"date": today.replace(day=12), "description": "RAPPI DELIVERY PIZZA", "amount": -14_900, "type": "expense", "cat": "Delivery", "account": account2},
        {"date": today.replace(day=13), "description": "TRANSFERENCIA RECIBIDA ARRIENDO", "amount": 350_000, "type": "income", "cat": "Arriendo recibido", "account": account1},
        {"date": today.replace(day=14), "description": "GASTOS COMUNES EDIFICIO", "amount": -38_000, "type": "expense", "cat": "Gastos comunes", "account": account1, "is_fixed": True},
        {"date": today.replace(day=15), "description": "LIDER EXPRESS SUPER", "amount": -42_300, "type": "expense", "cat": "Supermercado", "account": account2},
        {"date": today.replace(day=16), "description": "CAFE JUAN VALDEZ", "amount": -2_800, "type": "expense", "cat": "Gastos hormiga", "account": account1, "is_ant": True},
        {"date": today.replace(day=17), "description": "FARMACIA CRUZVERDE", "amount": -15_600, "type": "expense", "cat": "Farmacia", "account": account1},
        {"date": today.replace(day=18), "description": "DISNEY+ SUSCRIPCION", "amount": -5_990, "type": "expense", "cat": "Streaming video", "account": account2},
        {"date": today.replace(day=19), "description": "TAG AUTOPISTA CENTRAL", "amount": -8_700, "type": "expense", "cat": "Peajes/TAG", "account": account1},
        {"date": today.replace(day=20), "description": "TRANSFER CUENTA VISTA", "amount": -100_000, "type": "transfer", "cat": "Transferencias", "account": account1},
        {"date": today.replace(day=20), "description": "TRANSFER DESDE CUENTA CORRIENTE", "amount": 100_000, "type": "transfer", "cat": "Transferencias", "account": account2},
        {"date": today.replace(day=21), "description": "FALABELLA COMPRA ROPA", "amount": -45_900, "type": "expense", "cat": "Vestuario/Calzado", "account": account3},
        {"date": today.replace(day=22), "description": "MERCADOLIBRE COMPRA", "amount": -35_000, "type": "expense", "cat": "Online", "account": account3},
        {"date": today.replace(day=23), "description": "UNIMARC SUPER", "amount": -38_750, "type": "expense", "cat": "Supermercado", "account": account2},
        {"date": today.replace(day=24), "description": "ISAPRE CONSALUD", "amount": -62_000, "type": "expense", "cat": "Isapre/Fonasa", "account": account1, "is_fixed": True},
        # Previous month
        {"date": today.replace(day=1) - timedelta(days=30), "description": "TRANSFERENCIA EMPRESA S.A. - SUELDO", "amount": 1_500_000, "type": "income", "cat": "Sueldo", "account": account1},
        {"date": today.replace(day=5) - timedelta(days=30), "description": "DIVIDENDO HIPOTECARIO BCI", "amount": -420_000, "type": "expense", "cat": "Dividendo", "account": account1, "is_fixed": True},
        {"date": today.replace(day=8) - timedelta(days=30), "description": "JUMBO ARAUCO COMPRA", "amount": -55_200, "type": "expense", "cat": "Supermercado", "account": account1},
        {"date": today.replace(day=12) - timedelta(days=30), "description": "COLEGIO SAN PEDRO MENSUALIDAD", "amount": -95_000, "type": "expense", "cat": "Colegio", "account": account1, "is_fixed": True},
        {"date": today.replace(day=15) - timedelta(days=30), "description": "RESTAURANTE CENTRAL", "amount": -22_000, "type": "expense", "cat": "Restaurantes", "account": account1},
    ]

    for tx_data in transactions_data:
        cat_id = cat_map.get(tx_data["cat"])
        t = Transaction(
            date=tx_data["date"],
            description=tx_data["description"],
            amount=tx_data["amount"],
            transaction_type=tx_data["type"],
            category_id=cat_id,
            account_id=tx_data["account"].id,
            source="manual",
            is_fixed_expense=tx_data.get("is_fixed", False),
            is_ant_expense=tx_data.get("is_ant", False),
            is_transfer=tx_data["type"] == "transfer",
            status="confirmed",
        )
        session.add(t)

    # --- Fixed expenses ---
    fixed_expenses = [
        {"name": "Dividendo Hipotecario", "cat": "Vivienda", "amount": 420_000, "day": 6, "type": "dividendo", "start_date": date(2024, 1, 1), "total_installments": 240, "remaining_installments": 212},
        {"name": "Dividendo Hipotecario", "cat": "Vivienda", "amount": 14.5, "currency": "UF", "day": 6, "type": "dividendo", "start_date": date(2024, 1, 1), "total_installments": 240, "remaining_installments": 212},
        {"name": "Colegio San Pedro", "cat": "Educación", "amount": 95_000, "day": 10, "type": "colegio"},
        {"name": "Isapre Consalud", "cat": "Salud", "amount": 62_000, "day": 24, "type": "seguro"},
        {"name": "Gastos Comunes", "cat": "Vivienda", "amount": 38_000, "day": 14, "type": "servicio"},
        {"name": "Entel Celular", "cat": "Servicios", "amount": 19_990, "day": 11, "type": "servicio"},
    ]
    for fe_data in fixed_expenses:
        fe = FixedExpense(
            name=fe_data["name"],
            category_id=cat_map.get(fe_data["cat"]),
            expected_amount=fe_data["amount"],
            currency=fe_data.get("currency", "CLP"),
            start_date=fe_data.get("start_date"),
            payment_day=fe_data["day"],
            account_id=account1.id,
            is_active=True,
            expense_type=fe_data["type"],
            total_installments=fe_data.get("total_installments"),
            remaining_installments=fe_data.get("remaining_installments"),
        )
        session.add(fe)

    # --- Savings goals ---
    goals = [
        {"name": "Fondo de emergencia", "target": 3_000_000, "current": 850_000, "priority": 1, "desc": "6 meses de gastos fijos"},
        {"name": "Vacaciones 2025", "target": 1_500_000, "current": 450_000, "priority": 2, "date": date(2025, 12, 1), "desc": "Viaje a Europa"},
        {"name": "Auto nuevo", "target": 8_000_000, "current": 200_000, "priority": 3, "date": date(2027, 6, 1), "desc": "Cambio de auto"},
    ]
    for g_data in goals:
        goal = SavingsGoal(
            name=g_data["name"],
            target_amount=g_data["target"],
            current_amount=g_data["current"],
            priority=g_data["priority"],
            description=g_data.get("desc"),
            target_date=g_data.get("date"),
            status="active",
        )
        session.add(goal)

    # --- Budgets for current month ---
    today_dt = date.today()
    budgets_data = [
        ("Alimentación", 200_000),
        ("Transporte", 80_000),
        ("Ocio", 50_000),
        ("Compras", 100_000),
        ("Salud", 80_000),
    ]
    for cat_name, amount in budgets_data:
        cat_id = cat_map.get(cat_name)
        if cat_id:
            b = Budget(
                month=today_dt.month,
                year=today_dt.year,
                category_id=cat_id,
                expected_amount=amount,
            )
            session.add(b)

    session.commit()
    print("✅ Seed completed successfully.")
