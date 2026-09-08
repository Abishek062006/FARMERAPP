"""
Shared feature pipeline for the price models (D1 forecast, D2 sell/hold).

WHY THIS FILE EXISTS
    D1 and D2 train on the same data with the same features and differ only in
    their target. Copy-pasting the pipeline into both scripts is how the two
    silently diverge — one gets a bug fix, the other does not, and the models
    start disagreeing for reasons nobody can trace. One definition, two
    importers.

    price_forecast_engine.py deliberately recomputes these features at serving
    time rather than importing this module, because serving works from a short
    caller-supplied series rather than the full CSV. That duplication is real
    and is called out in that file — if you change a feature here, change it
    there too.
"""
import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "prices_maharashtra.csv")
MARKET_MAP = os.path.join(HERE, "data", "market_district_mh.json")
MODEL_DIR = os.path.join(HERE, "models")

TEST_MONTHS = 6                        # final 6 months held out, by date
MIN_HISTORY_DAYS = 45                  # a series needs this much span to be usable
MIN_OBS_PER_SERIES = 120               # below this, lag-30 features are mostly NaN

FEATURES = [
    "modal_price", "lag_1", "lag_7", "lag_14", "lag_30",
    "roll_mean_7", "roll_mean_30", "roll_std_7", "roll_std_30",
    "price_vs_mean_7", "price_vs_mean_30", "cv_30", "ret_1", "ret_7",
    "arrivals", "arr_lag_1", "arr_roll_7", "arr_roll_30", "arr_vs_mean_30",
    "n_markets", "dow", "month", "weekofyear", "horizon",
    "district", "commodity",
]
CATEGORICAL = ["district", "commodity"]


def log(msg):
    print(msg, flush=True)


def load_clean():
    """
    Load the D0 CSV and drop what cannot be modelled. Returns (df, dropped).

    Every filter here removes data that is wrong, never data that is merely
    inconvenient — the counts are reported so the cleaning stays auditable.
    """
    df = pd.read_csv(DATA, parse_dates=["date"])
    n0 = len(df)

    with open(MARKET_MAP) as f:
        m2d = json.load(f)
    df["district"] = df["market"].map(m2d)

    dropped = {}

    # Markets Agmarknet reports prices for but does not list under any district.
    dropped["unmapped_market"] = int(df["district"].isna().sum())
    df = df[df["district"].notna()]

    # modal_price 0 alongside a valid min/max is Agmarknet's missing-value
    # sentinel, not a free crop.
    dropped["modal_zero"] = int((df["modal_price"] <= 0).sum())
    df = df[df["modal_price"] > 0]

    # Internally inconsistent: the headline price outside its own min/max.
    bad = (df["modal_price"] < df["min_price"]) | (df["modal_price"] > df["max_price"])
    dropped["modal_outside_min_max"] = int(bad.sum())
    df = df[~bad]

    # Unit-scale errors. A few markets quote in something other than rupees per
    # quintal — Junnar(Alephata) reports onion at Rs 15,000-60,000 against a
    # Rs 1,300 market rate. Those rows ARE internally consistent, so the check
    # above misses them. The ceiling is deliberately generous (p99.9 x 1.5) so
    # that genuine shortage spikes survive: onion really does reach Rs 8,000 in
    # a bad year, and that is precisely the event the models need to see.
    ceilings = df.groupby("commodity")["modal_price"].quantile(0.999) * 1.5
    over = df["modal_price"] > df["commodity"].map(ceilings)
    dropped["unit_scale_outlier"] = int(over.sum())
    df = df[~over]

    log(f"  loaded {n0:,} rows -> {len(df):,} after cleaning")
    for k, v in dropped.items():
        log(f"    dropped {v:>6,}  {k}")
    return df, dropped


def aggregate(df):
    """
    Arrivals-weighted modal price per district-commodity-day.

    Weighted, not a plain mean: a market that moved 3,000 t is a better read on
    the district price than one that moved 8 t, and a plain mean lets a tiny
    market swing the district. This mirrors saleWindowService.js on the Node
    side, so the statistical engine and the models agree about what "the price
    in Nashik today" means.
    """
    df = df.copy()
    w = df["arrivals_tonnes"].where(df["arrivals_tonnes"] > 0, 1.0)
    df["_w"] = w
    df["_wp"] = w * df["modal_price"]

    g = df.groupby(["district", "commodity", "date"], as_index=False).agg(
        _wp=("_wp", "sum"),
        _w=("_w", "sum"),
        arrivals=("arrivals_tonnes", "sum"),
        n_markets=("market", "nunique"),
    )
    g["modal_price"] = g["_wp"] / g["_w"]
    return g[["district", "commodity", "date", "modal_price", "arrivals", "n_markets"]]


def build_features(g):
    """
    Lags are computed on a DAILY CALENDAR, not on the rows as they arrive.

    Mandis do not report every day — they close on Sundays and holidays, and a
    market can go quiet for a week. If lag-7 were "7 rows back" it would mean
    7 days in one series and 3 weeks in another, and the model would silently
    learn from a feature that means something different in every row.
    Reindexing to a daily grid first makes "7 days ago" literally that; days
    with no report stay NaN and LightGBM handles them natively.
    """
    frames = []
    for (dist, com), s in g.groupby(["district", "commodity"], sort=False):
        if len(s) < MIN_OBS_PER_SERIES:
            continue
        s = s.sort_values("date").set_index("date")
        if (s.index.max() - s.index.min()).days < MIN_HISTORY_DAYS:
            continue

        full = s.reindex(pd.date_range(s.index.min(), s.index.max(), freq="D"))
        full["district"] = dist
        full["commodity"] = com

        p = full["modal_price"]
        a = full["arrivals"]

        for lag in (1, 7, 14, 30):
            full[f"lag_{lag}"] = p.shift(lag)

        # min_periods well below the window so a series with gaps still gets a
        # value; a rolling mean needing 30 consecutive reports would be NaN
        # almost everywhere in this data.
        full["roll_mean_7"] = p.shift(1).rolling(7, min_periods=3).mean()
        full["roll_mean_30"] = p.shift(1).rolling(30, min_periods=8).mean()
        full["roll_std_7"] = p.shift(1).rolling(7, min_periods=3).std()
        full["roll_std_30"] = p.shift(1).rolling(30, min_periods=8).std()

        # The supply signal. Heavy arrivals lead price falls by a few days,
        # which is the whole reason arrivals are in the feature set.
        full["arr_lag_1"] = a.shift(1)
        full["arr_roll_7"] = a.shift(1).rolling(7, min_periods=3).mean()
        full["arr_roll_30"] = a.shift(1).rolling(30, min_periods=8).mean()

        frames.append(full.reset_index().rename(columns={"index": "date"}))

    f = pd.concat(frames, ignore_index=True)

    # Scale-free versions. These are what let one model serve both onion and
    # cotton: "12% above its own 30-day mean" means the same thing for each,
    # whereas "Rs 400 above" does not.
    f["price_vs_mean_7"] = f["modal_price"] / f["roll_mean_7"]
    f["price_vs_mean_30"] = f["modal_price"] / f["roll_mean_30"]
    f["cv_30"] = f["roll_std_30"] / f["roll_mean_30"]
    f["ret_1"] = np.log(f["modal_price"] / f["lag_1"])
    f["ret_7"] = np.log(f["modal_price"] / f["lag_7"])
    f["arr_vs_mean_30"] = f["arrivals"] / f["arr_roll_30"]

    f["dow"] = f["date"].dt.dayofweek
    f["month"] = f["date"].dt.month
    f["weekofyear"] = f["date"].dt.isocalendar().week.astype(int)

    # Only days with an actual reported price can serve as a forecast origin.
    return f[f["modal_price"].notna()]


def future_price_frame(f):
    """
    Per series, a daily-indexed future price lookup keyed by origin date.

    Yielded rather than returned so both trainers can attach whatever target
    they need (D1 wants price at t+h, D2 wants the whole t+1..t+h window)
    without this module having to know about either.
    """
    for (dist, com), s in f.groupby(["district", "commodity"], sort=False):
        s = s.sort_values("date").set_index("date")
        daily = s.reindex(pd.date_range(s.index.min(), s.index.max(), freq="D"))
        yield (dist, com), s, daily


def time_split(t, test_months=TEST_MONTHS):
    """
    Split BY TIME, never randomly.

    A random split lets a model see Thursday while predicting Wednesday. It
    inflates every score and tells you nothing about tomorrow, which is the
    only thing a farmer is asking about.
    """
    cutoff = t["date"].max() - pd.DateOffset(months=test_months)
    return t[t["date"] <= cutoff].copy(), t[t["date"] > cutoff].copy(), cutoff


def apply_categories(train, test, full):
    """Give both splits identical category levels, so codes line up."""
    for c in CATEGORICAL:
        cats = sorted(full[c].astype(str).unique())
        train[c] = pd.Categorical(train[c].astype(str), categories=cats)
        test[c] = pd.Categorical(test[c].astype(str), categories=cats)
    return train, test


def category_levels(t):
    return {c: sorted(t[c].astype(str).unique()) for c in CATEGORICAL}
