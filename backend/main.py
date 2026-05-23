import json
import sqlite3
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="GreenWind AI", version="1.0.0", description="Анализ озеленения районов Бишкека")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "greenwind.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─── Green Score Algorithm ────────────────────────────────────────────────────


def calculate_green_score(district_row):
    # Green coverage ratio: green_area / total_area, normalized to 10% ideal
    green_ratio = district_row["green_area_m2"] / (district_row["area_km2"] * 1_000_000)
    green_component = min(green_ratio / 0.10, 1.0) * 35

    # Distance to park: closer is better
    distance_penalty = min(district_row["avg_distance_to_park_m"] / 2000, 1.0)
    distance_component = (1 - distance_penalty) * 25

    # Building density: lower is better
    density_component = (1 - district_row["building_density"]) * 20

    # Population load on green space: fewer people per m² of green is better
    if district_row["green_area_m2"] > 0:
        # m² of green per person; 15 m²/person is WHO ideal
        green_per_person = district_row["green_area_m2"] / district_row["population"]
        pop_component = min(green_per_person / 15.0, 1.0) * 15
    else:
        pop_component = 0

    # Park count bonus (0-5 range)
    park_bonus = min(district_row["park_count"] / 5.0, 1.0) * 5

    score = green_component + distance_component + density_component + pop_component + park_bonus
    return round(max(0, min(100, score)), 1)


def get_level(score):
    if score < 30:
        return "CRITICAL"
    if score < 50:
        return "LOW"
    if score < 70:
        return "MEDIUM"
    return "HIGH"


def get_recommendation(score):
    if score < 30:
        return "Критический дефицит зелени. Нужен парк площадью минимум 2 га."
    if score < 50:
        return "Недостаточно зелени. Рекомендуется 2-3 pocket park по 0.5 га."
    if score < 70:
        return "Средний уровень. Добавить мини-сады вдоль улиц."
    return "Хороший уровень озеленения."


# ─── Seed Data ────────────────────────────────────────────────────────────────

DISTRICTS_SEED = [
    {
        "name": "Первомайский район",
        "lat": 42.8350,
        "lon": 74.5950,
        "population": 135000,
        "area_km2": 46.0,
        "green_area_m2": 1800000,
        "building_density": 0.35,
        "park_count": 5,
        "avg_distance_to_park_m": 450,
        "polygon_coords": [[42.82, 74.56], [42.82, 74.63], [42.85, 74.63], [42.85, 74.56]],
    },
    {
        "name": "Свердловский район",
        "lat": 42.8850,
        "lon": 74.5850,
        "population": 145000,
        "area_km2": 28.0,
        "green_area_m2": 650000,
        "building_density": 0.72,
        "park_count": 2,
        "avg_distance_to_park_m": 1200,
        "polygon_coords": [[42.87, 74.55], [42.87, 74.62], [42.90, 74.62], [42.90, 74.55]],
    },
    {
        "name": "Октябрьский район",
        "lat": 42.8780,
        "lon": 74.6200,
        "population": 120000,
        "area_km2": 38.0,
        "green_area_m2": 2100000,
        "building_density": 0.40,
        "park_count": 4,
        "avg_distance_to_park_m": 500,
        "polygon_coords": [[42.86, 74.59], [42.86, 74.65], [42.89, 74.65], [42.89, 74.59]],
    },
    {
        "name": "Ленинский район",
        "lat": 42.8650,
        "lon": 74.5400,
        "population": 128000,
        "area_km2": 32.0,
        "green_area_m2": 580000,
        "building_density": 0.68,
        "park_count": 2,
        "avg_distance_to_park_m": 1400,
        "polygon_coords": [[42.85, 74.51], [42.85, 74.57], [42.88, 74.57], [42.88, 74.51]],
    },
    {
        "name": "Аламединский (пригород)",
        "lat": 42.9100,
        "lon": 74.5500,
        "population": 55000,
        "area_km2": 52.0,
        "green_area_m2": 3200000,
        "building_density": 0.25,
        "park_count": 3,
        "avg_distance_to_park_m": 800,
        "polygon_coords": [[42.90, 74.52], [42.90, 74.58], [42.93, 74.58], [42.93, 74.52]],
    },
    {
        "name": "Джал микрорайон",
        "lat": 42.8200,
        "lon": 74.5800,
        "population": 85000,
        "area_km2": 8.5,
        "green_area_m2": 120000,
        "building_density": 0.78,
        "park_count": 1,
        "avg_distance_to_park_m": 1800,
        "polygon_coords": [[42.81, 74.56], [42.81, 74.60], [42.83, 74.60], [42.83, 74.56]],
    },
    {
        "name": "Восток-5 микрорайон",
        "lat": 42.8500,
        "lon": 74.6350,
        "population": 62000,
        "area_km2": 5.2,
        "green_area_m2": 85000,
        "building_density": 0.75,
        "park_count": 0,
        "avg_distance_to_park_m": 2000,
        "polygon_coords": [[42.84, 74.62], [42.84, 74.65], [42.86, 74.65], [42.86, 74.62]],
    },
]

RECOMMENDATIONS_SEED = [
    # Свердловский район (id=2) — low score, high priority
    {
        "district_id": 2,
        "lat": 42.8870,
        "lon": 74.5800,
        "address": "ул. Токтогула, 120",
        "priority": 1,
        "reason": "Высокая плотность застройки и дефицит зелёных зон в жилом квартале",
        "suggested_type": "park",
    },
    {
        "district_id": 2,
        "lat": 42.8830,
        "lon": 74.5900,
        "address": "пр. Чуй, 210",
        "priority": 1,
        "reason": "Отсутствие деревьев вдоль главной магистрали, высокий уровень выхлопов",
        "suggested_type": "mini_garden",
    },
    {
        "district_id": 2,
        "lat": 42.8860,
        "lon": 74.5750,
        "address": "ул. Киевская, 85",
        "priority": 2,
        "reason": "Пустырь между жилыми домами, подходит для карманного парка",
        "suggested_type": "pocket_park",
    },
    # Ленинский район (id=4) — low score, high priority
    {
        "district_id": 4,
        "lat": 42.8670,
        "lon": 74.5350,
        "address": "ул. Фрунзе, 200",
        "priority": 1,
        "reason": "Критический дефицит зелени в центральной части района",
        "suggested_type": "park",
    },
    {
        "district_id": 4,
        "lat": 42.8630,
        "lon": 74.5450,
        "address": "ул. Московская, 55",
        "priority": 1,
        "reason": "Жилой массив без единого зелёного пятна, перегрев территории летом",
        "suggested_type": "park",
    },
    {
        "district_id": 4,
        "lat": 42.8660,
        "lon": 74.5380,
        "address": "ул. Боконбаева, 140",
        "priority": 2,
        "reason": "Необходим карманный парк для пешеходной доступности зелени",
        "suggested_type": "pocket_park",
    },
    # Джал микрорайон (id=6) — critical score
    {
        "district_id": 6,
        "lat": 42.8210,
        "lon": 74.5750,
        "address": "ул. Ахунбаева, 180",
        "priority": 1,
        "reason": "Критический дефицит зелени при высокой плотности населения",
        "suggested_type": "park",
    },
    {
        "district_id": 6,
        "lat": 42.8190,
        "lon": 74.5830,
        "address": "ул. Тыналиева, 40",
        "priority": 1,
        "reason": "Отсутствие парков в жилом массиве, расстояние до ближайшего парка — 1.8 км",
        "suggested_type": "park",
    },
    {
        "district_id": 6,
        "lat": 42.8220,
        "lon": 74.5870,
        "address": "ул. Сухэ-Батора, 12",
        "priority": 1,
        "reason": "Пустырь рядом со школой, возможность создания зелёной зоны отдыха",
        "suggested_type": "pocket_park",
    },
    # Восток-5 микрорайон (id=7) — critical score
    {
        "district_id": 7,
        "lat": 42.8510,
        "lon": 74.6300,
        "address": "ул. Малдыбаева, 36",
        "priority": 1,
        "reason": "Нет ни одного парка в микрорайоне, критический дефицит",
        "suggested_type": "park",
    },
    {
        "district_id": 7,
        "lat": 42.8490,
        "lon": 74.6380,
        "address": "ул. Жукеева-Пудовкина, 68",
        "priority": 1,
        "reason": "Высокая плотность застройки без компенсирующих зелёных территорий",
        "suggested_type": "park",
    },
    {
        "district_id": 7,
        "lat": 42.8520,
        "lon": 74.6400,
        "address": "ул. Садырбаева, 15",
        "priority": 2,
        "reason": "Территория вдоль дороги подходит для аллеи и мини-сада",
        "suggested_type": "mini_garden",
    },
    # Первомайский район (id=1) — medium score
    {
        "district_id": 1,
        "lat": 42.8340,
        "lon": 74.5980,
        "address": "ул. Льва Толстого, 22",
        "priority": 3,
        "reason": "Можно улучшить озеленение вдоль второстепенных улиц",
        "suggested_type": "mini_garden",
    },
    {
        "district_id": 1,
        "lat": 42.8360,
        "lon": 74.5900,
        "address": "ул. Панфилова, 95",
        "priority": 2,
        "reason": "Пустой участок рядом с жилыми домами, подходит для мини-парка",
        "suggested_type": "pocket_park",
    },
    # Октябрьский район (id=3) — medium score
    {
        "district_id": 3,
        "lat": 42.8790,
        "lon": 74.6150,
        "address": "ул. Тоголок Молдо, 50",
        "priority": 3,
        "reason": "Улучшение зелёного покрытия вдоль улиц для снижения пылевой нагрузки",
        "suggested_type": "mini_garden",
    },
    {
        "district_id": 3,
        "lat": 42.8770,
        "lon": 74.6250,
        "address": "ул. Исанова, 77",
        "priority": 2,
        "reason": "Неиспользуемый участок земли возле школы, подходит для сквера",
        "suggested_type": "pocket_park",
    },
    # Аламединский район (id=5) — medium score
    {
        "district_id": 5,
        "lat": 42.9120,
        "lon": 74.5480,
        "address": "ул. Горького, 30",
        "priority": 3,
        "reason": "Улучшение связности зелёных зон между существующими парками",
        "suggested_type": "mini_garden",
    },
]

GREEN_ZONES_SEED = [
    {
        "name": "Парк имени Панфилова",
        "type": "Парк",
        "polygon_coords": [[42.879, 74.598], [42.879, 74.602], [42.876, 74.602], [42.876, 74.598]]
    },
    {
        "name": "Парк Ататюрка",
        "type": "Парк",
        "polygon_coords": [[42.840, 74.585], [42.840, 74.595], [42.830, 74.595], [42.830, 74.585]]
    },
    {
        "name": "Карагачевая роща",
        "type": "Лесопарк",
        "polygon_coords": [[42.895, 74.610], [42.895, 74.630], [42.885, 74.630], [42.885, 74.610]]
    },
    {
        "name": "Ботанический сад",
        "type": "Сад",
        "polygon_coords": [[42.845, 74.615], [42.845, 74.635], [42.835, 74.635], [42.835, 74.615]]
    },
]


# ─── Database initialization ─────────────────────────────────────────────────


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS districts (
            id INTEGER PRIMARY KEY,
            name TEXT,
            lat REAL,
            lon REAL,
            population INTEGER,
            area_km2 REAL,
            green_area_m2 REAL,
            building_density REAL,
            park_count INTEGER,
            avg_distance_to_park_m REAL,
            green_score REAL,
            level TEXT,
            recommendation TEXT,
            polygon_coords TEXT
        )
    """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY,
            district_id INTEGER,
            lat REAL,
            lon REAL,
            address TEXT,
            priority INTEGER,
            reason TEXT,
            suggested_type TEXT
        )
    """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS green_zones (
            id INTEGER PRIMARY KEY,
            name TEXT,
            type TEXT,
            polygon_coords TEXT
        )
    """
    )

    conn.commit()

    # Seed only if empty
    cursor.execute("SELECT COUNT(*) FROM districts")
    count = cursor.fetchone()[0]

    if count == 0:
        # Insert districts
        for d in DISTRICTS_SEED:
            cursor.execute(
                """
                INSERT INTO districts (name, lat, lon, population, area_km2, green_area_m2,
                    building_density, park_count, avg_distance_to_park_m, green_score, level,
                    recommendation, polygon_coords)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', ?)
            """,
                (
                    d["name"],
                    d["lat"],
                    d["lon"],
                    d["population"],
                    d["area_km2"],
                    d["green_area_m2"],
                    d["building_density"],
                    d["park_count"],
                    d["avg_distance_to_park_m"],
                    json.dumps(d["polygon_coords"]),
                ),
            )

        conn.commit()

        # Calculate and update green scores
        cursor.execute("SELECT * FROM districts")
        rows = cursor.fetchall()

        for row in rows:
            score = calculate_green_score(row)
            level = get_level(score)
            rec = get_recommendation(score)
            cursor.execute(
                "UPDATE districts SET green_score = ?, level = ?, recommendation = ? WHERE id = ?",
                (score, level, rec, row["id"]),
            )

        conn.commit()

        # Insert recommendations
        for r in RECOMMENDATIONS_SEED:
            cursor.execute(
                """
                INSERT INTO recommendations (district_id, lat, lon, address, priority, reason, suggested_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    r["district_id"],
                    r["lat"],
                    r["lon"],
                    r["address"],
                    r["priority"],
                    r["reason"],
                    r["suggested_type"],
                ),
            )

        conn.commit()

        # Insert green zones
        for gz in GREEN_ZONES_SEED:
            cursor.execute(
                """
                INSERT INTO green_zones (name, type, polygon_coords)
                VALUES (?, ?, ?)
            """,
                (
                    gz["name"],
                    gz["type"],
                    json.dumps(gz["polygon_coords"]),
                ),
            )

        conn.commit()

    conn.close()


# ─── Helpers ──────────────────────────────────────────────────────────────────


def row_to_dict(row):
    d = dict(row)
    if "polygon_coords" in d and d["polygon_coords"]:
        d["polygon_coords"] = json.loads(d["polygon_coords"])
    return d


# ─── Startup Event ───────────────────────────────────────────────────────────


@app.on_event("startup")
def startup():
    init_db()


# ─── API Endpoints ───────────────────────────────────────────────────────────


@app.get("/api/districts")
def get_districts():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM districts ORDER BY green_score ASC")
    rows = cursor.fetchall()
    result = [row_to_dict(row) for row in rows]
    conn.close()
    return result


@app.get("/api/districts/{district_id}")
def get_district(district_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM districts WHERE id = ?", (district_id,))
    row = cursor.fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Район не найден")
    return row_to_dict(row)


@app.get("/api/recommendations")
def get_recommendations():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM recommendations ORDER BY priority ASC")
    rows = cursor.fetchall()
    result = [dict(row) for row in rows]
    conn.close()
    return result


@app.get("/api/recommendations/{district_id}")
def get_recommendations_by_district(district_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM recommendations WHERE district_id = ? ORDER BY priority ASC",
        (district_id,),
    )
    rows = cursor.fetchall()
    result = [dict(row) for row in rows]
    conn.close()
    return result


@app.post("/api/recalculate")
def recalculate():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM districts")
    rows = cursor.fetchall()

    for row in rows:
        score = calculate_green_score(row)
        level = get_level(score)
        rec = get_recommendation(score)
        cursor.execute(
            "UPDATE districts SET green_score = ?, level = ?, recommendation = ? WHERE id = ?",
            (score, level, rec, row["id"]),
        )

    conn.commit()

    cursor.execute("SELECT * FROM districts ORDER BY green_score ASC")
    updated_rows = cursor.fetchall()
    result = [row_to_dict(row) for row in updated_rows]
    conn.close()
    return result

@app.get("/api/green-zones")
def get_green_zones():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM green_zones")
    rows = cursor.fetchall()
    result = [row_to_dict(row) for row in rows]
    conn.close()
    return result

class AIRequest(BaseModel):
    district_id: int
    api_key: str
    provider: str  # 'gemini' or 'claude'

@app.post("/api/ai-analyze")
def ai_analyze(request: AIRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM districts WHERE id = ?", (request.district_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row is None:
        raise HTTPException(status_code=404, detail="Район не найден")
        
    district = row_to_dict(row)
    
    # Analytical algorithm
    coords = district["polygon_coords"]
    avg_lat = sum(c[0] for c in coords) / len(coords)
    avg_lon = sum(c[1] for c in coords) / len(coords)
    
    density = district["building_density"]
    pop = district["population"]
    area = district["area_km2"]
    
    # Calculate offset to suggest a point slightly off-center based on density to avoid just center pin
    offset_lat = (0.5 - density) * 0.01 
    offset_lon = (density - 0.5) * 0.01
    
    suggested_lat = avg_lat + offset_lat
    suggested_lon = avg_lon + offset_lon
    
    pop_density = round(pop / area)
    
    analysis_text = f"Проведен глубокий анализ: {district['name']}. Плотность населения составляет {pop_density} чел/км². "
    analysis_text += f"Учитывая плотную застройку 5-10 этажными зданиями (коэффициент {density}) и удаленность от существующих парков ({district['avg_distance_to_park_m']} м), "
    
    if pop_density > 3000 and density > 0.6:
        analysis_text += "логически рекомендуется создание Pocket Park (карманного парка) во дворах, так как места для крупного парка нет."
        s_type = "pocket_park"
    elif district["avg_distance_to_park_m"] > 1000:
        analysis_text += "остро требуется создание крупного парка, так как текущее расстояние до ближайшей зоны отдыха превышает стандарты."
        s_type = "park"
    else:
        analysis_text += "рекомендуется организация мини-сада или зеленой аллеи для улучшения микроклимата района."
        s_type = "mini_garden"
        
    if request.api_key:
        analysis_text += f"\n\n[Использован токен {request.provider.upper()} для обработки данных]"
        
    return {
        "status": "success",
        "lat": suggested_lat,
        "lon": suggested_lon,
        "suggested_type": s_type,
        "reason": analysis_text,
        "priority": 1 if district["green_score"] < 50 else 2,
        "address": "Сгенерированная AI локация"
    }
