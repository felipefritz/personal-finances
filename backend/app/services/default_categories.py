from sqlmodel import Session, select

from app.models.category import Category

DEFAULT_CATEGORIES = [
    {
        "name": "Vivienda",
        "color": "#5C6BC0",
        "icon": "home",
        "subcategories": ["Dividendo", "Arriendo", "Contribuciones", "Gastos comunes"],
    },
    {
        "name": "Servicios",
        "color": "#29B6F6",
        "icon": "bolt",
        "subcategories": ["Electricidad", "Agua", "Internet", "Gas", "Celular"],
    },
    {
        "name": "Alimentación",
        "color": "#66BB6A",
        "icon": "restaurant",
        "subcategories": ["Supermercado", "Restaurantes", "Delivery", "Panadería"],
    },
    {
        "name": "Transporte",
        "color": "#FFA726",
        "icon": "directions_car",
        "subcategories": ["Combustible", "Peajes/TAG", "Transporte público", "Taxi/Rideshare", "Mantención"],
    },
    {
        "name": "Educación",
        "color": "#AB47BC",
        "icon": "school",
        "subcategories": ["Colegio", "Universidad", "Útiles", "Cursos online"],
    },
    {
        "name": "Salud",
        "color": "#EF5350",
        "icon": "favorite",
        "subcategories": ["Médico", "Dentista", "Farmacia", "Isapre/Fonasa"],
    },
    {"name": "Mascotas", "color": "#8D6E63", "icon": "pets", "subcategories": []},
    {
        "name": "Suscripciones",
        "color": "#EC407A",
        "icon": "subscriptions",
        "subcategories": ["Streaming video", "Streaming audio", "Cloud/Productividad", "Fitness"],
    },
    {"name": "Transferencias", "color": "#78909C", "icon": "swap_horiz", "subcategories": []},
    {"name": "Créditos", "color": "#FF7043", "icon": "credit_card", "subcategories": []},
    {
        "name": "Compras",
        "color": "#26C6DA",
        "icon": "shopping_bag",
        "subcategories": ["Vestuario/Calzado", "Tecnología", "Online", "Hogar"],
    },
    {
        "name": "Ocio",
        "color": "#FFCA28",
        "icon": "sports_esports",
        "subcategories": ["Entretenimiento", "Juegos", "Deporte"],
    },
    {"name": "Viajes", "color": "#26A69A", "icon": "flight", "subcategories": []},
    {"name": "Gastos hormiga", "color": "#BDBDBD", "icon": "coffee", "subcategories": []},
    {
        "name": "Ingresos",
        "color": "#4CAF50",
        "icon": "trending_up",
        "subcategories": ["Sueldo", "Freelance", "Inversiones", "Arriendo recibido", "Otros ingresos"],
    },
    {"name": "Otros", "color": "#9E9E9E", "icon": "more_horiz", "subcategories": []},
]


def _normalize(value: str) -> str:
    return value.strip().casefold()


def apply_default_categories(session: Session) -> dict[str, int]:
    existing = session.exec(select(Category)).all()
    by_key = {(_normalize(c.name), c.parent_id): c for c in existing}

    created_categories = 0
    created_subcategories = 0
    skipped_categories = 0
    skipped_subcategories = 0

    for category_def in DEFAULT_CATEGORIES:
        parent_key = (_normalize(category_def["name"]), None)
        parent = by_key.get(parent_key)

        if parent is None:
            parent = Category(
                name=category_def["name"],
                color=category_def.get("color"),
                icon=category_def.get("icon"),
                is_system=True,
            )
            session.add(parent)
            session.flush()
            by_key[parent_key] = parent
            created_categories += 1
        else:
            skipped_categories += 1
            updated = False
            if not parent.color and category_def.get("color"):
                parent.color = category_def["color"]
                updated = True
            if not parent.icon and category_def.get("icon"):
                parent.icon = category_def["icon"]
                updated = True
            if not parent.is_system:
                parent.is_system = True
                updated = True
            if updated:
                session.add(parent)

        for sub_name in category_def.get("subcategories", []):
            sub_key = (_normalize(sub_name), parent.id)
            if sub_key in by_key:
                skipped_subcategories += 1
                continue

            sub = Category(name=sub_name, parent_id=parent.id, is_system=True)
            session.add(sub)
            session.flush()
            by_key[sub_key] = sub
            created_subcategories += 1

    session.commit()

    return {
        "created_categories": created_categories,
        "created_subcategories": created_subcategories,
        "skipped_categories": skipped_categories,
        "skipped_subcategories": skipped_subcategories,
    }
