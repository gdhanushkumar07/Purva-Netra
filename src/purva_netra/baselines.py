"""Reference forecasts of P(bust). B0 = climatology, B2 = ensemble spread (logistic)."""
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression

B2_FEATURES = ["spread_anom", "lead"]


def b0_fit(train):
    return dict(table=train.groupby(["rid", "lead", "month"]).bust.mean().rename("p_b0"),
                overall=float(train.bust.mean()))


def b0_predict(m, df):
    p = df.join(m["table"], on=["rid", "lead", "month"])["p_b0"].fillna(m["overall"])
    return p.where(df.get("assessed", True)).to_numpy()


def b0_climatology(train, test):
    return b0_predict(b0_fit(train), test)


def b2_fit(train):
    return LogisticRegression(max_iter=1000).fit(train[B2_FEATURES], train.bust)


def b2_predict(m, df):
    X = df[B2_FEATURES]
    ok = X.notna().all(axis=1).to_numpy()
    p = np.full(len(df), np.nan)
    p[ok] = m.predict_proba(X[ok])[:, 1]
    return p


def b2_spread(train, test):
    return b2_predict(b2_fit(train), test)
