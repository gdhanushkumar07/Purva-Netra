"""§7 main model: LightGBM classifier (monotone in spread_anom) + isotonic calibration + quantile error heads."""
import lightgbm as lgb
import numpy as np, pandas as pd
from sklearn.isotonic import IsotonicRegression

FEATURES = ["lead", "rid", "doy_sin", "doy_cos",
            "spread_anom", "ens_log_spread", "hres_minus_em", "ens_iqr_rel", "p_heavy_member", "ens_heavy_frac",
            "f_rain_anom", "q850_anom", "u850_anom", "mslp_min_anom",
            "rev12", "rev24", "ffi4",
            "regime", "low_bay", "low_arabian", "wd_trough",
            "an_err_mean", "an_err_q90", "an_bust_rate", "an_novelty"]
CATEGORICAL = ["rid", "regime"]
GROUPS = {
    "identity": ["rid", "doy_sin", "doy_cos"],
    "spread": ["spread_anom", "ens_log_spread", "hres_minus_em", "ens_iqr_rel", "p_heavy_member", "ens_heavy_frac"],
    "state": ["f_rain_anom", "q850_anom", "u850_anom", "mslp_min_anom"],
    "revision": ["rev12", "rev24", "ffi4"],
    "regime": ["regime", "low_bay", "low_arabian", "wd_trough"],
    "analogs": ["an_err_mean", "an_err_q90", "an_bust_rate", "an_novelty"],
}
PARAMS = dict(n_estimators=2000, learning_rate=0.03, num_leaves=31, min_child_samples=200, subsample=0.8,
              subsample_freq=1, colsample_bytree=0.8, verbose=-1, random_state=0)


def available(df, features=FEATURES):
    """Features that exist and are not entirely missing (e.g. state/regime if not extracted)."""
    return [f for f in features if f in df and df[f].notna().any()]


def _prep(df, feats):
    X = df[feats].copy()
    for c in CATEGORICAL:
        if c in X:
            X[c] = X[c].astype("category")
    for c in X.columns:
        if X[c].dtype == bool:
            X[c] = X[c].astype(int)
    return X


def fit_main(train, valid, feats, monotone=True):
    mono = [1 if (f == "spread_anom" and monotone) else 0 for f in feats]
    clf = lgb.LGBMClassifier(**PARAMS, monotone_constraints=mono)
    clf.fit(_prep(train, feats), train.bust, eval_set=[(_prep(valid, feats), valid.bust)],
            categorical_feature=[c for c in CATEGORICAL if c in feats],
            callbacks=[lgb.early_stopping(100, verbose=False)])
    clf.feats_ = feats
    return clf


def predict_raw(clf, df):
    return clf.predict_proba(_prep(df, clf.feats_))[:, 1]


def calibrate(p_raw_calib, y_calib):
    return IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(p_raw_calib, y_calib)


def fit_quantile(train, valid, feats, alpha):
    reg = lgb.LGBMRegressor(objective="quantile", alpha=alpha, **PARAMS)
    reg.fit(_prep(train, feats), train.log_err, eval_set=[(_prep(valid, feats), valid.log_err)],
            eval_metric="quantile", categorical_feature=[c for c in CATEGORICAL if c in feats],
            callbacks=[lgb.early_stopping(100, verbose=False)])
    reg.feats_ = feats
    return reg


def predict_q(reg, df):
    return np.clip(reg.predict(_prep(df, reg.feats_)), 0, None)


def early_stop_split(train):
    """Validation for early stopping = last 3 months of the train years (not the calibration year)."""
    last = train.init.dt.year.max()
    v = (train.init.dt.year == last) & (train.init.dt.month >= 10)
    return train[~v], train[v]
