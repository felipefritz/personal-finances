from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.category import Category
from app.schemas.category import (
    CategoryCreate,
    CategoryDefaultsResult,
    CategoryRead,
    CategoryUpdate,
    CategoryWithChildren,
)
from app.services.default_categories import apply_default_categories

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("/", response_model=List[CategoryRead])
def list_categories(session: Session = Depends(get_session)):
    return session.exec(select(Category).order_by(Category.name)).all()


@router.get("/tree", response_model=List[CategoryWithChildren])
def list_categories_tree(session: Session = Depends(get_session)):
    all_cats = session.exec(select(Category).order_by(Category.name)).all()
    cat_map = {c.id: CategoryWithChildren(**c.model_dump(), children=[]) for c in all_cats}
    roots = []
    for c in all_cats:
        if c.parent_id and c.parent_id in cat_map:
            cat_map[c.parent_id].children.append(cat_map[c.id])
        elif not c.parent_id:
            roots.append(cat_map[c.id])
    return roots


@router.get("/{category_id}", response_model=CategoryRead)
def get_category(category_id: int, session: Session = Depends(get_session)):
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return cat


@router.post("/", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, session: Session = Depends(get_session)):
    # Prevent duplicate names within the same parent level
    existing = session.exec(
        select(Category).where(
            Category.name == data.name,
            Category.parent_id == data.parent_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una categoría llamada '{data.name}' en este nivel",
        )
    cat = Category(**data.model_dump())
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


@router.post("/defaults", response_model=CategoryDefaultsResult)
def create_default_categories(session: Session = Depends(get_session)):
    return apply_default_categories(session)


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(category_id: int, data: CategoryUpdate, session: Session = Depends(get_session)):
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    updated = data.model_dump(exclude_unset=True)
    new_name = updated.get("name", cat.name)
    new_parent = updated.get("parent_id", cat.parent_id)
    if "name" in updated or "parent_id" in updated:
        conflict = session.exec(
            select(Category).where(
                Category.name == new_name,
                Category.parent_id == new_parent,
                Category.id != category_id,
            )
        ).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe una categoría llamada '{new_name}' en este nivel",
            )
    for key, value in updated.items():
        setattr(cat, key, value)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, session: Session = Depends(get_session)):
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if cat.is_system:
        raise HTTPException(status_code=400, detail="No se puede eliminar una categoría del sistema")
    session.delete(cat)
    session.commit()
