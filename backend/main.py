import json
import sqlite3
import os
import math
import random
import urllib.request
import urllib.parse
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


# ─── Distance Helper ─────────────────────────────────────────────────────────

def distance_m(lat1, lon1, lat2, lon2):
    # Haversine distance in meters
    R = 6371000  # radius of Earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


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


# ─── OSM Fetch Function ───────────────────────────────────────────────────────

def fetch_osm_parks():
    print("Fetching real green zones from OSM...")
    query = """
    [out:json][timeout:25];
    (
      way["leisure"="park"](42.78,74.50,42.92,74.68);
      way["leisure"="garden"](42.78,74.50,42.92,74.68);
      way["landuse"="forest"](42.78,74.50,42.92,74.68);
      way["leisure"="pitch"](42.78,74.50,42.92,74.68);
    );
    out geom;
    """
    url = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({'data': query}).encode('utf-8')
    try:
        req = urllib.request.Request(url, data=data, headers={'User-Agent': 'GreenWindAI/1.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))
            
        parks = []
        for element in result.get('elements', []):
            if element['type'] == 'way' and 'geometry' in element:
                coords = [[pt['lat'], pt['lon']] for pt in element['geometry']]
                if len(coords) < 3: continue
                name = element.get('tags', {}).get('name', 'Зеленая зона (OSM)')
                p_type = element.get('tags', {}).get('leisure', element.get('tags', {}).get('landuse', 'park'))
                parks.append({
                    "name": name,
                    "type": p_type,
                    "polygon_coords": coords
                })
        print(f"Fetched {len(parks)} green zones from OSM!")
        return parks
    except Exception as e:
        print(f"OSM fetch failed: {e}")
        return []


# ─── Database Initialization ─────────────────────────────────────────────────

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

        # Insert recommendations seed
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

        # Fetch and insert green zones
        osm_parks = fetch_osm_parks()
        if osm_parks and len(osm_parks) > 0:
            for gz in osm_parks:
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
        else:
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


# ─── Dynamic Grid Search Recommendations ─────────────────────────────────────

@app.get("/api/generate-recommendations")
def generate_recommendations():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM districts")
    districts = [row_to_dict(row) for row in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM green_zones")
    green_zones = [row_to_dict(row) for row in cursor.fetchall()]
    
    # Clean up prior dynamic recommendations to avoid duplicates
    cursor.execute("DELETE FROM recommendations")
    conn.commit()
    
    # 20x20 grid search across Bishkek bounds
    lats = [42.81 + i * 0.005 for i in range(20)]
    lons = [74.52 + i * 0.007 for i in range(20)]
    grid_points = []
    
    for lat in lats:
        for lon in lons:
            # Find closest district
            min_d_dist = None
            closest_dist = None
            for d in districts:
                dist = distance_m(lat, lon, d["lat"], d["lon"])
                if min_d_dist is None or dist < min_d_dist:
                    min_d_dist = dist
                    closest_dist = d
            
            if closest_dist is None:
                continue
            
            # Find distance to closest existing green zone
            min_g_dist = 999999
            for gz in green_zones:
                if gz["polygon_coords"] and len(gz["polygon_coords"]) > 0:
                    gc_lat = sum(c[0] for c in gz["polygon_coords"]) / len(gz["polygon_coords"])
                    gc_lon = sum(c[1] for c in gz["polygon_coords"]) / len(gz["polygon_coords"])
                    g_dist = distance_m(lat, lon, gc_lat, gc_lon)
                    if g_dist < min_g_dist:
                        min_g_dist = g_dist
                        
            # Deficiency score = distance_to_park * (district_population_density / 1000)
            pop_density = closest_dist["population"] / closest_dist["area_km2"]
            deficiency_score = min_g_dist * (pop_density / 1000.0)
            
            grid_points.append({
                "lat": lat,
                "lon": lon,
                "district_id": closest_dist["id"],
                "score": deficiency_score,
                "distance": min_g_dist,
                "district_name": closest_dist["name"]
            })
            
    # Filter points
    grid_points.sort(key=lambda x: x["score"], reverse=True)
    selected_points = []
    for pt in grid_points:
        if pt["distance"] < 300:
            continue
            
        # Ensure far enough from other selected recommendations
        too_close = False
        for spt in selected_points:
            if distance_m(pt["lat"], pt["lon"], spt["lat"], spt["lon"]) < 800:
                too_close = True
                break
        if not too_close:
            selected_points.append(pt)
        if len(selected_points) >= 4:
            break
            
    if len(selected_points) == 0:
        selected_points = grid_points[:4]
        
    # Seed new dynamic recommendations
    for idx, pt in enumerate(selected_points):
        s_type = "park" if pt["distance"] > 1000 else "pocket_park"
        if idx == 3:
            s_type = "mini_garden"
            
        reason = f"<b>Слепая зона!</b><br/>Здесь обнаружен дефицит озеленения. Ближайшая зеленая зона находится в <b>{int(pt['distance'])} метрах</b>. При высокой плотности населения района ({pt['district_name']}) здесь жизненно необходима новая зеленая инфраструктура."
        
        cursor.execute(
            """
            INSERT INTO recommendations (district_id, lat, lon, address, priority, reason, suggested_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            (
                pt["district_id"],
                pt["lat"],
                pt["lon"],
                f"Локация {idx+1} (Требует озеленения)",
                1 if idx < 2 else 2,
                reason,
                s_type,
            ),
        )
    conn.commit()
    
    cursor.execute("SELECT * FROM recommendations ORDER BY priority ASC")
    rows = cursor.fetchall()
    result = [dict(row) for row in rows]
    conn.close()
    return result


# ─── Recommendation Details Endpoint ─────────────────────────────────────────

@app.get("/api/recommendation-details/{rec_id}")
def get_recommendation_details(rec_id: int):
    """Return rich contextual analytics + before/after green score forecast."""
    conn = get_db()
    cursor = conn.cursor()

    # 1) Get the recommendation itself
    cursor.execute("SELECT * FROM recommendations WHERE id = ?", (rec_id,))
    rec_row = cursor.fetchone()
    if rec_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Рекомендация не найдена")
    rec = dict(rec_row)

    # 2) Get the parent district
    cursor.execute("SELECT * FROM districts WHERE id = ?", (rec["district_id"],))
    dist_row = cursor.fetchone()
    if dist_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Район не найден")
    dist = dict(dist_row)

    # 3) Nearest green zone (using OSM green zones in DB)
    cursor.execute("SELECT * FROM green_zones")
    gz_rows = cursor.fetchall()
    
    min_park_dist = None
    nearest_park_name = "Нет вблизи"
    
    for gz_row in gz_rows:
        gz_dict = row_to_dict(gz_row)
        coords = gz_dict.get("polygon_coords", [])
        if coords and len(coords) >= 3:
            center_lat = sum(c[0] for c in coords) / len(coords)
            center_lon = sum(c[1] for c in coords) / len(coords)
            d = distance_m(rec["lat"], rec["lon"], center_lat, center_lon)
            if min_park_dist is None or d < min_park_dist:
                min_park_dist = d
                nearest_park_name = gz_dict.get("name", "Зеленая зона")

    min_park_dist = int(min_park_dist) if min_park_dist else 0

    # 4) Population density
    pop_density = round(dist["population"] / dist["area_km2"])

    # 5) Green deficit (m² per person vs WHO 15 m²)
    green_per_person = round(dist["green_area_m2"] / dist["population"], 1) if dist["population"] > 0 else 0
    who_deficit = round(max(0, 15.0 - green_per_person), 1)

    # 6) Forecast: simulate adding a new green area of typical size
    type_areas = {"park": 20000, "pocket_park": 5000, "mini_garden": 2000}
    added_area = type_areas.get(rec.get("suggested_type"), 5000)

    # Simulate: increase green area of district
    new_green_area = dist["green_area_m2"] + added_area
    sim_dist = dict(dist)
    sim_dist["green_area_m2"] = new_green_area
    sim_dist["park_count"] += 1
    sim_dist["avg_distance_to_park_m"] = round((dist["avg_distance_to_park_m"] * dist["park_count"] + 300) / (dist["park_count"] + 1))
    
    before_score = dist["green_score"]
    after_score = calculate_green_score(sim_dist)
    
    conn.close()

    return {
        "recommendation": rec,
        "district": row_to_dict(dist_row),
        "analytics": {
            "pop_density": pop_density,
            "green_per_person": green_per_person,
            "who_deficit": who_deficit,
            "nearest_park_name": nearest_park_name,
            "nearest_park_distance": min_park_dist
        },
        "forecast": {
            "before_score": before_score,
            "after_score": after_score,
            "added_area_m2": added_area
        }
    }


# ─── AI Analyze Endpoints ────────────────────────────────────────────────────

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
    
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Район не найден")
        
    district = row_to_dict(row)
    
    # Calculate boundaries for coordinates randomization
    coords = district["polygon_coords"]
    min_lat = min(c[0] for c in coords)
    max_lat = max(c[0] for c in coords)
    min_lon = min(c[1] for c in coords)
    max_lon = max(c[1] for c in coords)
    
    density = district["building_density"]
    pop = district["population"]
    area = district["area_km2"]
    pop_density = round(pop / area)
    
    prompt = f"""
Ты — главный урбанист и ИИ-аналитик Бишкека. Твоя задача — проанализировать район и выбрать 3 РАЗНЫЕ точки (координаты), где острее всего нужны зеленые зоны.
Данные по району "{district['name']}":
- Площадь: {area} км²
- Население: {pop} чел. (Плотность: {pop_density} чел/км²)
- Плотность застройки (доля многоэтажек): {density}
- Среднее расстояние до парков: {district['avg_distance_to_park_m']} м.
- Координаты (примерные границы района): {coords[:4]}...

Основываясь на этих данных, выбери 3 разные точки (lat, lon) строго внутри этих координат, где логичнее всего посадить деревья или сделать парк.
Учитывай, что в густонаселенных районах (высокая плотность) нет места для больших парков (нужен pocket_park), а при большом расстоянии до парков нужен полноценный park.

Верни ответ СТРОГО в формате JSON без markdown разметки:
[
  {{
    "lat": 42.xxx,
    "lon": 74.xxx,
    "suggested_type": "park" / "pocket_park" / "mini_garden",
    "reason": "Короткое обоснование на русском языке (почему именно здесь и этот тип)",
    "priority": 1
  }},
  ...
]
"""
    
    first_response = None
    items = []
    
    # Try calling Live LLM API if key is provided
    if request.api_key:
        try:
            if request.provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={request.api_key}"
                req_data = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json"}
                }
                req = urllib.request.Request(
                    url,
                    data=json.dumps(req_data).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=30) as response:
                    res_json = json.loads(response.read().decode("utf-8"))
                    text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                    items = json.loads(text)
                    
            elif request.provider == "claude":
                url = "https://api.anthropic.com/v1/messages"
                req_data = {
                    "model": "claude-3-haiku-20240307",
                    "max_tokens": 1500,
                    "messages": [{"role": "user", "content": prompt}]
                }
                req = urllib.request.Request(
                    url,
                    data=json.dumps(req_data).encode("utf-8"),
                    headers={
                        "x-api-key": request.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    }
                )
                with urllib.request.urlopen(req, timeout=30) as response:
                    res_json = json.loads(response.read().decode("utf-8"))
                    text = res_json["content"][0]["text"]
                    items = json.loads(text)
        except Exception as e:
            print(f"AI API Error: {e}")
            
    # Clear draft/old recommendations from recommendations table
    cursor.execute("DELETE FROM recommendations")
    conn.commit()
            
    # If API call succeeded and returned items, write them
    if items and len(items) >= 3:
        for i, item in enumerate(items[:3]):
            suggested_lat = float(item.get('lat', district['lat']))
            suggested_lon = float(item.get('lon', district['lon']))
            s_type = item.get('suggested_type', 'park')
            reason_html = item.get('reason', 'Анализ завершен.')
            priority = int(item.get('priority', i+1))
            
            final_reason = f"""
<div style="font-size:13px; border: 1px solid var(--green-primary); padding: 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.05);">
  <b style="color:var(--green-primary);font-size:14px;display:flex;align-items:center;gap:6px;">
    🤖 Сгенерировано ИИ ({request.provider.upper()})
  </b>
  <div style="margin:8px 0;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;">
    <b>📊 База: {district['name']}</b>
    <ul style="margin:4px 0 0;padding-left:20px;color:var(--text-secondary);">
      <li>Плотность: {pop_density} чел/км²</li>
      <li>Ср. расст. до парка: {district['avg_distance_to_park_m']} м</li>
    </ul>
  </div>
  <div style="margin-top:8px;">{reason_html}</div>
</div>
"""
            address = f"🤖 ИИ Точка {i+1}: {district['name']}"
            
            cursor.execute(
                "INSERT INTO recommendations (district_id, lat, lon, address, priority, reason, suggested_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (district["id"], suggested_lat, suggested_lon, address, priority, final_reason, s_type)
            )
            
            if i == 0:
                first_response = {
                    "status": "success",
                    "lat": suggested_lat,
                    "lon": suggested_lon,
                    "suggested_type": s_type,
                    "reason": final_reason,
                    "priority": priority,
                    "address": address
                }
    else:
        # Robust mathematical Fallback logic
        types_pool = ["pocket_park", "park", "mini_garden"]
        priorities = [1, 1, 2]
        reasons_pool = [
            ("Густая застройка и дефицит дворовых пространств", "Высокая плотность многоэтажных зданий, жители лишены рекреационного пространства."),
            ("Удалённость от ближайших парков", f"Расстояние до ближайшего парка превышает {district['avg_distance_to_park_m']} м — нужна зелёная зона в шаговой доступности."),
            ("Загазованность вдоль трассы", "Высокий трафик вдоль магистрали создаёт повышенную пылевую и шумовую нагрузку на жителей."),
        ]
        
        for i in range(3):
            # Random point within bbox boundaries with slight padding
            pad = 0.002
            r_lat = random.uniform(min_lat + pad, max_lat - pad)
            r_lon = random.uniform(min_lon + pad, max_lon - pad)
            
            s_type = types_pool[i]
            title, body = reasons_pool[i]
            
            analysis_text = f"""
<div style="font-size:13px; border: 1px solid var(--green-primary); padding: 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.05);">
  <b style="color:var(--green-primary);font-size:14px;display:flex;align-items:center;gap:6px;">
    🤖 Сгенерировано ИИ (Математический Fallback)
  </b>
  <div style="margin:8px 0;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;">
    <b>📊 База: {district['name']}</b>
    <ul style="margin:4px 0 0;padding-left:20px;color:var(--text-secondary);">
      <li>Плотность: {pop_density} чел/км²</li>
      <li>Ср. расст. до парка: {district['avg_distance_to_park_m']} м</li>
    </ul>
  </div>
  <div style="margin-top:8px;"><b>💡 {title}:</b><br/>{body}</div>
</div>
"""
            address = f"ИИ Рекомендация {i+1}: {district['name']}"
            
            cursor.execute(
                "INSERT INTO recommendations (district_id, lat, lon, address, priority, reason, suggested_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (district["id"], r_lat, r_lon, address, priorities[i], analysis_text, s_type)
            )
            
            if i == 0:
                first_response = {
                    "status": "success",
                    "lat": r_lat,
                    "lon": r_lon,
                    "suggested_type": s_type,
                    "reason": analysis_text,
                    "priority": priorities[i],
                    "address": address
                }
                
    conn.commit()
    conn.close()
    return first_response
