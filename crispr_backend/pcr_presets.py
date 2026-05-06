import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

# ─────────────────────────────────────────────────────────────────────────────
# Database Setup
# ─────────────────────────────────────────────────────────────────────────────

DB_PATH = "data/pcr_presets.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    import os
    os.makedirs("data", exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pcr_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT,
        description TEXT,
        default_reaction_volume REAL,
        allowed_reaction_volumes TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pcr_preset_components (
        id TEXT PRIMARY KEY,
        preset_id TEXT NOT NULL,
        name TEXT NOT NULL,
        component_type TEXT NOT NULL,
        calculation_mode TEXT NOT NULL,
        stock_concentration REAL,
        stock_unit TEXT,
        final_concentration REAL,
        final_unit TEXT,
        fixed_volume REAL,
        volume_per_25ul REAL,
        ratio_denominator REAL,
        include_in_master_mix INTEGER DEFAULT 1,
        is_optional INTEGER DEFAULT 0,
        display_order INTEGER DEFAULT 0,
        FOREIGN KEY (preset_id) REFERENCES pcr_presets(id) ON DELETE CASCADE
    )
    """)
    
    # 2. Seed Defaults
    cursor.execute("SELECT COUNT(*) FROM pcr_presets WHERE is_default = 1")
    if cursor.fetchone()[0] == 0:
        seed_default_presets(cursor)
        
    conn.commit()
    conn.close()

def seed_default_presets(cursor):
    now = datetime.now().isoformat()
    
    # 1. Taq 2X Master Mix
    taq_id = "taq_2x_default"
    cursor.execute("""
        INSERT INTO pcr_presets (id, name, category, source, default_reaction_volume, allowed_reaction_volumes, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (taq_id, "Taq 2X Master Mix", "Master Mix", "General", 20.0, "[20, 40]", 1, now, now))
    
    taq_comps = [
        (str(uuid.uuid4()), taq_id, "Taq 2X Master Mix", "master_mix", "fixed_ratio", None, None, None, None, None, None, 2.0, 1, 0, 1),
        (str(uuid.uuid4()), taq_id, "Forward Primer", "primer", "primer_concentration", 10.0, "µM", 0.2, "µM", None, None, None, 1, 0, 2),
        (str(uuid.uuid4()), taq_id, "Reverse Primer", "primer", "primer_concentration", 10.0, "µM", 0.2, "µM", None, None, None, 1, 0, 3),
        (str(uuid.uuid4()), taq_id, "Template DNA", "template", "user_input", None, None, None, None, None, None, None, 0, 0, 4),
        (str(uuid.uuid4()), taq_id, "Nuclease-Free Water", "water", "fill_to_reaction_volume", None, None, None, None, None, None, None, 1, 0, 5)
    ]
    cursor.executemany("INSERT INTO pcr_preset_components VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", taq_comps)

    # 2. Q5 High-Fidelity DNA Polymerase
    q5_id = "q5_neb_default"
    cursor.execute("""
        INSERT INTO pcr_presets (id, name, category, source, default_reaction_volume, allowed_reaction_volumes, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (q5_id, "Q5 High-Fidelity DNA Polymerase", "Advanced Components", "NEB M0491", 20.0, "[20, 40]", 1, now, now))
    
    q5_comps = [
        (str(uuid.uuid4()), q5_id, "5X Q5 Reaction Buffer", "buffer", "fixed_ratio", None, None, None, None, None, None, 5.0, 1, 0, 1),
        (str(uuid.uuid4()), q5_id, "10 mM dNTPs", "dnstps", "fixed_final_concentration", 10.0, "mM", 200.0, "µM", None, None, None, 1, 0, 2),
        (str(uuid.uuid4()), q5_id, "Forward Primer", "primer", "primer_concentration", 10.0, "µM", 0.5, "µM", None, None, None, 1, 0, 3),
        (str(uuid.uuid4()), q5_id, "Reverse Primer", "primer", "primer_concentration", 10.0, "µM", 0.5, "µM", None, None, None, 1, 0, 4),
        (str(uuid.uuid4()), q5_id, "Template DNA", "template", "user_input", None, None, None, None, None, None, None, 0, 0, 5),
        (str(uuid.uuid4()), q5_id, "Q5 High-Fidelity DNA Polymerase", "enzyme", "volume_per_25ul", None, None, None, None, None, 0.25, None, 1, 0, 6),
        (str(uuid.uuid4()), q5_id, "5X Q5 High GC Enhancer", "buffer", "fixed_ratio", None, None, None, None, None, None, 5.0, 1, 1, 7),
        (str(uuid.uuid4()), q5_id, "Nuclease-Free Water", "water", "fill_to_reaction_volume", None, None, None, None, None, None, None, 1, 0, 8)
    ]
    cursor.executemany("INSERT INTO pcr_preset_components VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", q5_comps)

# ─────────────────────────────────────────────────────────────────────────────
# Models & Router
# ─────────────────────────────────────────────────────────────────────────────

class ComponentModel(BaseModel):
    id: Optional[str] = None
    name: str
    componentType: str
    calculationMode: str
    stockConcentration: Optional[float] = None
    stockUnit: Optional[str] = None
    finalConcentration: Optional[float] = None
    finalUnit: Optional[str] = None
    fixedVolume: Optional[float] = None
    volumePer25ul: Optional[float] = None
    ratioDenominator: Optional[float] = None
    includeInMasterMix: bool = True
    isOptional: bool = False
    displayOrder: int = 0

class PresetModel(BaseModel):
    id: Optional[str] = None
    name: str
    category: str
    source: Optional[str] = None
    description: Optional[str] = None
    defaultReactionVolume: float = 20.0
    allowedReactionVolumes: List[float] = []
    isDefault: bool = False
    components: List[ComponentModel]

router = APIRouter(prefix="/pcr-presets", tags=["pcr-presets"])

def to_camel(snake_str):
    components = snake_str.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

@router.get("")
def list_presets(db: sqlite3.Connection = Depends(get_db)):
    presets = db.execute("SELECT * FROM pcr_presets ORDER BY is_default DESC, name ASC").fetchall()
    result = []
    for p in presets:
        p_dict = dict(p)
        # Handle camelCase conversion and JSON parsing
        formatted = {
            "id": p_dict["id"],
            "name": p_dict["name"],
            "category": p_dict["category"],
            "source": p_dict["source"],
            "description": p_dict["description"],
            "defaultReactionVolume": p_dict["default_reaction_volume"],
            "allowedReactionVolumes": json.loads(p_dict["allowed_reaction_volumes"] or "[]"),
            "isDefault": bool(p_dict["is_default"]),
            "createdAt": p_dict["created_at"],
            "updatedAt": p_dict["updated_at"]
        }
        
        # Load components
        comps = db.execute("SELECT * FROM pcr_preset_components WHERE preset_id = ? ORDER BY display_order ASC", (p_dict["id"],)).fetchall()
        formatted["components"] = []
        for c in comps:
            c_dict = dict(c)
            formatted["components"].append({
                "id": c_dict["id"],
                "name": c_dict["name"],
                "componentType": c_dict["component_type"],
                "calculationMode": c_dict["calculation_mode"],
                "stockConcentration": c_dict["stock_concentration"],
                "stockUnit": c_dict["stock_unit"],
                "finalConcentration": c_dict["final_concentration"],
                "finalUnit": c_dict["final_unit"],
                "fixedVolume": c_dict["fixed_volume"],
                "volumePer25ul": c_dict["volume_per_25ul"],
                "ratioDenominator": c_dict["ratio_denominator"],
                "includeInMasterMix": bool(c_dict["include_in_master_mix"]),
                "isOptional": bool(c_dict["is_optional"]),
                "displayOrder": c_dict["display_order"]
            })
        result.append(formatted)
    return result

@router.post("")
def create_preset(preset: PresetModel, db: sqlite3.Connection = Depends(get_db)):
    preset_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    
    db.execute("""
        INSERT INTO pcr_presets (id, name, category, source, description, default_reaction_volume, allowed_reaction_volumes, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (preset_id, preset.name, preset.category, preset.source, preset.description, preset.defaultReactionVolume, json.dumps(preset.allowedReactionVolumes), 0, now, now))
    
    for i, comp in enumerate(preset.components):
        db.execute("""
            INSERT INTO pcr_preset_components VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (str(uuid.uuid4()), preset_id, comp.name, comp.componentType, comp.calculationMode, 
              comp.stockConcentration, comp.stockUnit, comp.finalConcentration, comp.finalUnit, 
              comp.fixedVolume, comp.volumePer25ul, comp.ratioDenominator, 
              1 if comp.includeInMasterMix else 0, 1 if comp.isOptional else 0, i))
    
    db.commit()
    return {"id": preset_id, "status": "created"}

@router.delete("/{preset_id}")
def delete_preset(preset_id: str, db: sqlite3.Connection = Depends(get_db)):
    # Check if default
    is_def = db.execute("SELECT is_default FROM pcr_presets WHERE id = ?", (preset_id,)).fetchone()
    if is_def and is_def[0] == 1:
        raise HTTPException(status_code=403, detail="Cannot delete default presets.")
        
    db.execute("DELETE FROM pcr_presets WHERE id = ?", (preset_id,))
    db.execute("DELETE FROM pcr_preset_components WHERE preset_id = ?", (preset_id,))
    db.commit()
    return {"status": "deleted"}
