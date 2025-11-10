import math
import random
from math import radians, sin, cos, sqrt, atan2

def shopping_predict_carbon_footprint(payload: dict) -> float:
    MATERIAL_EF_KG_PER_KG = {
        "stainless_steel": 6.15, "steel": 2.0, "aluminum": 9.0, "copper": 4.0,
        "glass": 1.3, "pp_plastic": 1.9, "pe": 2.0, "pet": 2.7, "abs": 2.4,
        "cotton": 5.0, "paper": 1.1, "cardboard": 0.8, "corrugate": 0.8,
        "molded_pulp": 1.0, "lithium_ion_battery": 12.0, "electronics_pcba": 15.0,
    }

    LOGI_EF_KG_PER_TKM = {
        "air": 0.90,
        "ocean": 0.015,
        "truck": 0.12,
        "rail": 0.03,
        "van": 0.18,
        "bike": 0.0,
    }

    DEFAULT_GRID_EF = 0.40

    CATEGORY_MASS_EF = {
        "electronics": 10.0,
        "apparel": 8.0,
        "furniture": 3.0,
        "toy": 4.0,
    }

    CATEGORY_SPEND_EF = {
        "electronics": 0.50,
        "apparel": 0.40,
        "furniture": 0.20,
        "grocery": 0.60,
        "_default": 0.45,
    }

    EOL_EF_KG_PER_KG = {
        "landfill": 0.02,
        "incineration": 0.70,
        "recycling": -0.30,
    }

    # -----------------------------
    # Helpers
    # -----------------------------
    def _lower(s):
        return s.lower() if isinstance(s, str) else s

    def _lookup_category_key(cat):
        if not cat:
            return None
        c = _lower(cat)
        for key in set(list(CATEGORY_MASS_EF.keys()) + list(CATEGORY_SPEND_EF.keys())):
            if key in c:
                return key
        return None

    def _sum_materials_kgco2e(materials):
        total = 0.0
        for m in (materials or []):
            name = _lower(m.get("name"))
            mass = float(m.get("mass_kg", 0) or 0)
            ef = MATERIAL_EF_KG_PER_KG.get(name, None)
            if ef is None and name in ("cardboard", "corrugated_cardboard", "corrugate"):
                ef = MATERIAL_EF_KG_PER_KG["corrugate"]
            if ef is None:
                ef = 2.0  # generic plastic-ish fallback
            total += mass * ef
        return total

    def _sum_packaging_kgco2e(packaging):
        total = 0.0
        for p in (packaging or []):
            mat = _lower(p.get("material"))
            mass = float(p.get("mass_kg", 0) or 0)
            ef = (
                MATERIAL_EF_KG_PER_KG.get(mat)
                or (MATERIAL_EF_KG_PER_KG["corrugate"] if mat in ("corrugate", "cardboard", "corrugated_cardboard") else None)
                or (MATERIAL_EF_KG_PER_KG["paper"] if mat == "paper" else None)
                or (MATERIAL_EF_KG_PER_KG["molded_pulp"] if mat == "molded_pulp" else None)
            )
            if ef is None:
                ef = 1.2
            total += mass * ef
        return total

    def _logistics_kgco2e(shipped_mass_kg, segments, return_probability=0.0):
        if not segments or shipped_mass_kg <= 0:
            return 0.0
        mass_tonnes = shipped_mass_kg / 1000.0
        base = 0.0
        for seg in segments:
            mode = _lower(seg.get("mode"))
            dist_km = float(seg.get("distance_km", 0) or 0)
            ef = LOGI_EF_KG_PER_TKM.get(mode, 0.12)
            base += mass_tonnes * dist_km * ef
        return base * (1.0 + max(0.0, min(1.0, float(return_probability or 0.0))))

    def _use_phase_kgco2e(use):
        if not use:
            return 0.0
        years = float(use.get("years", 0) or 0)
        if years <= 0:
            return 0.0
        grid_ef = float(use.get("grid_ef_kg_per_kwh", DEFAULT_GRID_EF) or DEFAULT_GRID_EF)
        kwh_per_year = use.get("kwh_per_year", None)
        if kwh_per_year is not None:
            energy_kwh = float(kwh_per_year) * years
        else:
            power_w = float(use.get("power_w", 0) or 0)
            hours_per_day = float(use.get("hours_per_day", 0) or 0)
            energy_kwh = (power_w / 1000.0) * hours_per_day * 365.0 * years
        return energy_kwh * grid_ef

    def _eol_kgco2e(eol, product_mass_kg):
        if not eol or product_mass_kg <= 0:
            return 0.0
        total = 0.0
        for item in eol:
            pathway = _lower(item.get("pathway"))
            frac = float(item.get("fraction", 0) or 0)
            ef = EOL_EF_KG_PER_KG.get(pathway, 0.02)
            total += product_mass_kg * frac * ef
        return total

    def _bounded(value, rel_sd):
        if value <= 0 or rel_sd <= 0:
            return value
        sigma = math.sqrt(math.log(1 + rel_sd**2))
        mu = math.log(value) - 0.5 * sigma**2
        return math.exp(random.gauss(mu, sigma))

    # -----------------------------
    # Parse payload and compute
    # -----------------------------
    product = payload.get("product", {}) or {}
    scope = (payload.get("scope") or "cradle_to_grave").lower()

    # Rung A
    epd_block = payload.get("epd") or {}
    epd_enabled = bool(epd_block.get("enabled", False))
    epd_hit_value = product.get("epd_hit_kgco2e", None)
    production_epd = float(epd_hit_value) if (epd_enabled and epd_hit_value is not None) else None

    # Rung B
    materials = product.get("materials") or []
    packaging = product.get("packaging") or []
    weight_kg = float(product.get("weight_kg", 0) or 0)
    production_B_materials = _sum_materials_kgco2e(materials) if materials else None
    packaging_B = _sum_packaging_kgco2e(packaging) if packaging else 0.0

    # Rung C
    category_key = _lookup_category_key(product.get("category"))
    production_C = None
    if production_B_materials is None and weight_kg > 0 and category_key:
        production_C = weight_kg * CATEGORY_MASS_EF.get(category_key, 5.0)

    # Rung D
    price_value = product.get("price_value", None)
    production_D = None
    if production_B_materials is None and production_C is None and price_value is not None:
        ef = CATEGORY_SPEND_EF.get(category_key, CATEGORY_SPEND_EF["_default"])
        production_D = float(price_value) * ef

    if production_epd is not None:
        production_core = production_epd
    elif production_B_materials is not None:
        production_core = production_B_materials
    elif production_C is not None:
        production_core = production_C
    elif production_D is not None:
        production_core = production_D
    else:
        production_core = 0.0

    production_total = production_core + packaging_B

    # Logistics
    logistics_block = payload.get("logistics") or {}
    segments = logistics_block.get("segments") or []
    shipped_mass_kg = float(logistics_block.get("shipped_mass_kg", 0) or 0)
    return_probability = float(logistics_block.get("return_probability", 0) or 0)
    logistics_total = _logistics_kgco2e(shipped_mass_kg, segments, return_probability)

    # Use
    use_total = _use_phase_kgco2e(payload.get("use"))

    # EOL
    eol_total = _eol_kgco2e(payload.get("eol"), weight_kg)

    # Scope
    if scope == "cradle_to_gate":
        total = production_total
    elif scope == "cradle_to_customer":
        total = production_total + logistics_total
    else:
        total = production_total + logistics_total + use_total + eol_total

    # Optional uncertainty (ignored for return value; we still compute to honor payload)
    quality = payload.get("quality") or {}
    mc_runs = int(quality.get("mc_runs", 0) or 0)
    variation_pct = float(quality.get("variation_pct", 0) or 0.0)
    if mc_runs > 0 and variation_pct > 0:
        samples = []
        for _ in range(mc_runs):
            prod_j = _bounded(production_total, variation_pct)
            logi_j = _bounded(logistics_total, variation_pct)
            use_j = _bounded(use_total, variation_pct)
            eol_j = _bounded(eol_total, variation_pct)
            if scope == "cradle_to_gate":
                total_j = prod_j
            elif scope == "cradle_to_customer":
                total_j = prod_j + logi_j
            else:
                total_j = prod_j + logi_j + use_j + eol_j
            samples.append(total_j)
        # We return the nominal `total` per signature; MC affects nothing returned.
        # If you prefer to return the mean instead, swap the next line:
        # total = statistics.fmean(samples)
        _ = (samples[0], samples[-1])  # keep lint quiet

    return float(round(total, 6))

def get_flight_emissions(schema) -> float:
    """
    Estimate total flight emissions (kg CO2e) for ALL passengers from the given schema.
    Signature: def get_flight_emissions(schema: dict) -> float

    Behavior:
      - Uses aircraft fuel-burn (kg/h) when aircraft_icao is present and known and block_time_minutes > 0.
      - Falls back to distance * EF when aircraft info is unavailable.
      - Applies default combustion factor (3.16 kgCO2/kg fuel), cabin multipliers, load factor, and RFI.
      - Returns a single float: total kg CO2e for ALL passengers for the itinerary.
    """
    # ---- helpers ----
    def haversine_km(lat1, lon1, lat2, lon2) -> float:
        R = 6371.0
        phi1 = radians(lat1)
        phi2 = radians(lat2)
        dphi = radians(lat2 - lat1)
        dlambda = radians(lon2 - lon1)
        a = sin(dphi/2.0)**2 + cos(phi1)*cos(phi2)*sin(dlambda/2.0)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        return R * c

    # ---- IATA coords (small set; extend as needed) ----
    IATA_COORDS = {
        "JFK": (40.6413, -73.7781), "LHR": (51.4700, -0.4543),
        "LAX": (33.9416, -118.4085), "CDG": (49.0097, 2.5479),
        "SFO": (37.7749, -122.4194), "ORD": (41.9742, -87.9073),
        "ATL": (33.6407, -84.4277), "DXB": (25.2532, 55.3657),
        "HND": (35.5494, 139.7798), "ICN": (37.4602, 126.4407),
        "SIN": (1.3644, 103.9915), "SYD": (-33.9399, 151.1753)
    }

    # ---- Expanded aircraft lookup (approximate defaults) ----
    # Values sourced from public fuel-burn summaries (ICCT, EUROCONTROL, curated tables).
    # Use operator/ICEC-provided block fuel for regulatory accuracy.
    AIRCRAFT_LOOKUP = {
        # narrowbodies (kg fuel per hour, typical seats)
        "A318": {"fuel_kg_h": 2200, "typical_seats": 110},
        "A319": {"fuel_kg_h": 2374, "typical_seats": 140},
        "A320": {"fuel_kg_h": 2430, "typical_seats": 150},
        "A321": {"fuel_kg_h": 2740, "typical_seats": 185},
        "B738": {"fuel_kg_h": 2400, "typical_seats": 160},  # 737-800 ~2.4 t/h
        "B737": {"fuel_kg_h": 2400, "typical_seats": 160},

        # medium widebodies
        "A330": {"fuel_kg_h": 5650, "typical_seats": 275},
        "A332": {"fuel_kg_h": 5590, "typical_seats": 250},
        "A333": {"fuel_kg_h": 5700, "typical_seats": 277},
        "B763": {"fuel_kg_h": 4800, "typical_seats": 240},
        "B764": {"fuel_kg_h": 4940, "typical_seats": 260},

        # newer long-range twins
        "B788": {"fuel_kg_h": 4500, "typical_seats": 246},
        "B789": {"fuel_kg_h": 5000, "typical_seats": 280},
        "A359": {"fuel_kg_h": 5800, "typical_seats": 300},  # A350-900 ~5.8 t/h
        "B77W": {"fuel_kg_h": 8000, "typical_seats": 365},  # 777-300ER ~7-8 t/h

        # large / very large
        "A380": {"fuel_kg_h": 11500, "typical_seats": 525},  # ~11-12 t/h
        "B744": {"fuel_kg_h": 10000, "typical_seats": 416},  # 747-400 approx 10 t/h
        "B748": {"fuel_kg_h": 11000, "typical_seats": 410},  # 747-8 approx 11 t/h
    }

    # ---- constants & defaults ----
    KGCO2_PER_KG_FUEL = 3.16
    RFI = 1.3
    AVG_BLOCK_SPEED_KMH = 900.0
    DEFAULT_LOAD_FACTOR = 0.85
    CABIN_MULTIPLIERS = {"economy": 1.0, "premium_economy": 1.5, "business": 2.5, "first": 3.5}
    FALLBACK_ECONOMY_EF = 0.09  # kgCO2 per pax-km (economy base, fallback)

    cabin = schema.get("cabin_class", "economy")
    cabin_mult = CABIN_MULTIPLIERS.get(cabin, 1.0)
    try:
        num_passengers = max(1, int(schema.get("num_passengers", 1)))
    except Exception:
        num_passengers = 1
    itinerary = schema.get("itinerary", [])

    # ---- compute ----
    total_kgCO2e_all_passengers = 0.0

    for leg in itinerary:
        origin = (leg.get("origin_iata") or "").upper()
        destination = (leg.get("destination_iata") or "").upper()
        if not origin or not destination:
            raise ValueError("Each leg must include 'origin_iata' and 'destination_iata'.")

        # distance if coords available
        distance_km = 0.0
        if origin in IATA_COORDS and destination in IATA_COORDS:
            lat1, lon1 = IATA_COORDS[origin]
            lat2, lon2 = IATA_COORDS[destination]
            distance_km = haversine_km(lat1, lon1, lat2, lon2)

        # block hours (hours) preference: explicit block_time_minutes, else distance fallback
        block_minutes = leg.get("block_time_minutes")
        block_hours = None
        if block_minutes is not None:
            try:
                block_hours = float(block_minutes) / 60.0
            except Exception:
                block_hours = None
        if block_hours is None:
            block_hours = (distance_km / AVG_BLOCK_SPEED_KMH) if distance_km > 0 else 0.0

        # try aircraft lookup
        aircraft_code = (leg.get("aircraft_icao") or "").upper()
        aircraft_info = AIRCRAFT_LOOKUP.get(aircraft_code)

        if aircraft_info and block_hours > 0:
            # aircraft fuel-burn method
            fuel_kg_per_h = float(aircraft_info["fuel_kg_h"])
            seats = int(aircraft_info["typical_seats"])
            fuel_kg_leg = fuel_kg_per_h * block_hours
            kgco2_from_fuel = fuel_kg_leg * KGCO2_PER_KG_FUEL
            per_pax_co2 = kgco2_from_fuel / (seats * DEFAULT_LOAD_FACTOR)
            per_pax_co2_alloc = per_pax_co2 * cabin_mult
            per_pax_co2e = per_pax_co2_alloc * RFI
            leg_total = per_pax_co2e * num_passengers
            total_kgCO2e_all_passengers += leg_total
        else:
            # fallback distance-based EF
            ef_per_pax_per_km = FALLBACK_ECONOMY_EF * cabin_mult
            per_pax_co2 = distance_km * ef_per_pax_per_km
            per_pax_co2e = per_pax_co2 * RFI
            leg_total = per_pax_co2e * num_passengers
            total_kgCO2e_all_passengers += leg_total

    return float(total_kgCO2e_all_passengers)
