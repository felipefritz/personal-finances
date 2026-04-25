"""
Categorization service: assigns categories to transactions based on keyword rules.
"""
from typing import Optional

CATEGORIZATION_RULES: list[dict] = [
    # Transporte
    {"keywords": ["uber", "cabify", "bolt", "didi", "taxi"], "category": "Transporte", "subcategory": "Taxi/Rideshare"},
    {"keywords": ["bip", "metro", "transantiago", "red"], "category": "Transporte", "subcategory": "Transporte público"},
    {"keywords": ["combustible", "bencina", "copec", "enex", "petrobras", "shell"], "category": "Transporte", "subcategory": "Combustible"},
    {"keywords": ["tag", "autopista", "peaje"], "category": "Transporte", "subcategory": "Peajes/TAG"},
    # Alimentación
    {"keywords": ["jumbo", "lider", "unimarc", "santa isabel", "tottus", "acuenta", "ekono"], "category": "Alimentación", "subcategory": "Supermercado"},
    {"keywords": ["rappi", "ubereats", "pedidos ya", "pedidosya", "delivery"], "category": "Alimentación", "subcategory": "Delivery"},
    {"keywords": ["restaurante", "restaurant", "sushi", "pizza", "burger", "mcdonalds", "bk ", "subway"], "category": "Alimentación", "subcategory": "Restaurantes"},
    # Suscripciones
    {"keywords": ["netflix", "hbo", "disney", "prime video", "apple tv", "paramount"], "category": "Suscripciones", "subcategory": "Streaming video"},
    {"keywords": ["spotify", "apple music", "deezer", "tidal"], "category": "Suscripciones", "subcategory": "Streaming audio"},
    {"keywords": ["youtube premium", "google one", "icloud", "dropbox", "microsoft 365", "office 365"], "category": "Suscripciones", "subcategory": "Cloud/Productividad"},
    {"keywords": ["gym", "gimnasio", "smartfit", "equinox"], "category": "Suscripciones", "subcategory": "Fitness"},
    # Vivienda
    {"keywords": ["dividendo", "hipotecario", "credito hipotecario"], "category": "Vivienda", "subcategory": "Dividendo"},
    {"keywords": ["arriendo", "renta", "alquiler"], "category": "Vivienda", "subcategory": "Arriendo"},
    {"keywords": ["gastos comunes", "condominio", "administracion edificio"], "category": "Vivienda", "subcategory": "Gastos comunes"},
    {"keywords": ["contribuciones", "impuesto territorial"], "category": "Vivienda", "subcategory": "Contribuciones"},
    # Servicios
    {"keywords": ["cge", "chilectra", "enel", "luz", "electricidad"], "category": "Servicios", "subcategory": "Electricidad"},
    {"keywords": ["aguasandinas", "essal", "agua potable"], "category": "Servicios", "subcategory": "Agua"},
    {"keywords": ["entel", "movistar", "claro", "wom", "vtr", "celular", "movil"], "category": "Servicios", "subcategory": "Celular"},
    {"keywords": ["internet", "fibra", "banda ancha"], "category": "Servicios", "subcategory": "Internet"},
    {"keywords": ["metrogas", "gas"], "category": "Servicios", "subcategory": "Gas"},
    # Educación
    {"keywords": ["colegio", "liceo", "school", "matrícula", "matricula", "mensualidad colegio"], "category": "Educación", "subcategory": "Colegio"},
    {"keywords": ["universidad", "ucv", "uc ", "uchile", "udp", "puc"], "category": "Educación", "subcategory": "Universidad"},
    {"keywords": ["útiles", "utiles", "libros", "cuadernos"], "category": "Educación", "subcategory": "Útiles"},
    # Salud
    {"keywords": ["isapre", "fonasa", "clinica", "clínica", "hospital", "medico", "médico", "dentista", "farmacia", "salcobrand", "cruzverde"], "category": "Salud", "subcategory": None},
    # Mascotas
    {"keywords": ["pet", "veterinaria", "veterinario", "mascotas", "alimento perro", "alimento gato"], "category": "Mascotas", "subcategory": None},
    # Transferencias
    {"keywords": ["transferencia", "transf.", "traspaso"], "category": "Transferencias", "subcategory": None},
    # Créditos
    {"keywords": ["cuota credito", "credito de consumo", "prestamo", "préstamo"], "category": "Créditos", "subcategory": None},
    # Compras
    {"keywords": ["falabella", "ripley", "paris", "corona", "forever", "zara", "h&m", "nike", "adidas"], "category": "Compras", "subcategory": "Vestuario/Calzado"},
    {"keywords": ["amazon", "aliexpress", "mercadolibre", "mercado libre"], "category": "Compras", "subcategory": "Online"},
    # Viajes
    {"keywords": ["airbnb", "hotel", "aeropuerto", "latam", "copa airlines", "sky airline", "vuelo"], "category": "Viajes", "subcategory": None},
    # Ocio
    {"keywords": ["cinema", "cineplanet", "cinemark", "teatro", "concierto", "entrada"], "category": "Ocio", "subcategory": "Entretenimiento"},
    {"keywords": ["juego", "steam", "playstation", "xbox", "nintendo"], "category": "Ocio", "subcategory": "Juegos"},
]

ANT_EXPENSE_MAX_AMOUNT = 5000  # CLP — expenses below this are considered "ant expenses"
ANT_EXPENSE_KEYWORDS = ["cafe", "café", "snack", "vending", "kiosko", "quiosco", "dulce", "pasteleria"]
DEBT_KEYWORDS = [
    "cuota", "credito", "crédito", "prestamo", "préstamo", "hipotec", "avance", "sobregiro", "rotativo", "pago minimo", "pago mínimo",
]
FIXED_EXPENSE_KEYWORDS = [
    "mensualidad", "suscripcion", "suscripción", "plan ", "arriendo", "dividendo", "seguro", "internet", "celular", "colegio", "isapre", "fonasa", "gimnasio", "netflix", "spotify", "disney", "hbo", "gastos comunes",
]
INCOME_KEYWORDS = [
    "sueldo", "remuneracion", "remuneración", "abono", "deposito", "depósito", "pago recibido", "reembolso", "cashback", "interes", "interés", "devolucion", "devolución",
]
TRANSFER_KEYWORDS = ["transferencia", "transf.", "traspaso"]


def suggest_category(description: str, amount: float) -> dict:
    """
    Returns classification hints based on description and amount.
    """
    desc_lower = description.lower()
    result = {
        "category": None,
        "subcategory": None,
        "is_ant_expense": _is_ant_expense(desc_lower, amount),
        "is_debt": any(keyword in desc_lower for keyword in DEBT_KEYWORDS),
        "is_fixed_expense": any(keyword in desc_lower for keyword in FIXED_EXPENSE_KEYWORDS),
        "suggested_type": _suggest_transaction_type(desc_lower, amount),
        "is_installment": _is_installment(desc_lower),
    }

    for rule in CATEGORIZATION_RULES:
        for keyword in rule["keywords"]:
            if keyword in desc_lower:
                result["category"] = rule["category"]
                result["subcategory"] = rule.get("subcategory")
                return result

    return result


def _is_ant_expense(desc_lower: str, amount: float) -> bool:
    normalized_amount = abs(amount)
    if normalized_amount <= ANT_EXPENSE_MAX_AMOUNT:
        return True
    for kw in ANT_EXPENSE_KEYWORDS:
        if kw in desc_lower:
            return True
    return False


def _suggest_transaction_type(desc_lower: str, amount: float) -> str:
    if any(keyword in desc_lower for keyword in TRANSFER_KEYWORDS):
        return "transfer"
    if any(keyword in desc_lower for keyword in INCOME_KEYWORDS):
        return "income"
    if amount > 0:
        return "income"
    return "expense"


def _is_installment(desc_lower: str) -> bool:
    return "cuota" in desc_lower or "/" in desc_lower and any(token.isdigit() for token in desc_lower.split("/"))
