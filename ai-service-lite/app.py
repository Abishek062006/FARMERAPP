from flask import Flask, request, jsonify
import traceback

import price_forecast_engine
import sell_hold_engine

# Lightweight deployment build of ../ai-service/app.py — carries only the
# routes that don't need TensorFlow: D1 price forecast and D2 sell/hold.
# Disease detection (/predict, /pesticide) and freshness grading
# (/grade-photo) are deliberately NOT here — they need the plant-disease and
# freshness CNNs, which pull in tensorflow and push this service's real RAM
# use from ~150MB to 500MB+. Splitting them out is what lets this run inside
# a free-tier instance. The full app.py (unchanged) is still what local dev
# and the mobile app run against.

app = Flask(__name__)

# No flask_cors here on purpose: the backend (Node) is this service's only
# caller — it proxies every request server-to-server, so the browser never
# talks to this service directly and there is no cross-origin request to
# permit. Skips one more dependency.


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "running", "service": "ai-service-lite"})


@app.route("/price-forecast", methods=["POST"])
def price_forecast():
    try:
        body = request.get_json(silent=True) or {}
        district = body.get("district")
        commodity = body.get("commodity")
        series = body.get("series")
        horizons = body.get("horizons")

        if not district or not commodity:
            return jsonify({"success": False, "error": "district and commodity are required"}), 400
        if not isinstance(series, list) or not series:
            return jsonify({"success": False, "error": "series must be a non-empty array of {date, modalPrice, arrivals}"}), 400
        if horizons is not None:
            if not isinstance(horizons, list) or not all(isinstance(h, int) for h in horizons):
                return jsonify({"success": False, "error": "horizons must be an array of integers"}), 400

        result = price_forecast_engine.forecast(series, district, commodity, horizons)

        if "error" in result:
            code = 503 if result["error"] == "MODEL_NOT_TRAINED" else 422
            return jsonify({"success": False, **result}), code

        return jsonify({"success": True, "data": result})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/price-forecast/commodities", methods=["GET"])
def price_forecast_commodities():
    data = price_forecast_engine.servable()
    if data is None:
        return jsonify({"success": False, "error": "MODEL_NOT_TRAINED", "message": "Run train_price_forecast.py first."}), 503
    return jsonify({"success": True, "data": data})


@app.route("/price-forecast/metrics", methods=["GET"])
def price_forecast_metrics():
    price_forecast_engine.load()
    m = price_forecast_engine.metrics()
    if not m:
        return jsonify({"success": False, "error": "Model has not been trained"}), 503
    return jsonify({"success": True, "data": m})


@app.route("/sell-hold", methods=["POST"])
def sell_hold():
    try:
        body = request.get_json(silent=True) or {}
        district = body.get("district")
        commodity = body.get("commodity")
        series = body.get("series")
        horizon = body.get("horizon", 7)

        if not district or not commodity:
            return jsonify({"success": False, "error": "district and commodity are required"}), 400
        if not isinstance(series, list) or not series:
            return jsonify({"success": False, "error": "series must be a non-empty array of {date, modalPrice, arrivals}"}), 400
        if not isinstance(horizon, int):
            return jsonify({"success": False, "error": "horizon must be an integer"}), 400

        result = sell_hold_engine.advise(series, district, commodity, horizon)

        if "error" in result:
            code = 503 if result["error"] == "MODEL_NOT_TRAINED" else 422
            return jsonify({"success": False, **result}), code

        return jsonify({"success": True, "data": result})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/sell-hold/metrics", methods=["GET"])
def sell_hold_metrics():
    sell_hold_engine.load()
    m = sell_hold_engine.metrics()
    if not m:
        return jsonify({"success": False, "error": "Model has not been trained"}), 503
    return jsonify({"success": True, "data": m})


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
