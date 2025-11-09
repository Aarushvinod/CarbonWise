import math
import statistics
import random

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