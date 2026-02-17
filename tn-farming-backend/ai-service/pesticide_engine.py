from pesticide_rules import PESTICIDE_DATABASE


def calculate_pesticide(disease_name, area_sqft, severity="moderate"):

    if disease_name not in PESTICIDE_DATABASE:
        return None

    data = PESTICIDE_DATABASE[disease_name]

    water_per_1000 = data["water_required_per_1000_sqft_litre"]
    dosage_per_litre = data["dosage_per_litre_ml"]

    multiplier = 1
    if severity == "mild":
        multiplier = 0.8
    elif severity == "severe":
        multiplier = 1.2

    total_water = (area_sqft / 1000) * water_per_1000
    total_pesticide_ml = total_water * dosage_per_litre * multiplier

    bottles_needed = total_pesticide_ml / 1000
    cost_estimate = bottles_needed * data["price_per_litre"]

    return {
        "pesticide_name": data["name"],
        "total_water_litre": round(total_water, 2),
        "total_pesticide_ml": round(total_pesticide_ml, 2),
        "bottles_needed_litre": round(bottles_needed, 2),
        "estimated_cost": round(cost_estimate, 2)
    }
