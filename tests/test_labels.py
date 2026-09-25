import numpy as np, pandas as pd, pytest

from purva_netra.labels import add_log_error, fit_thresholds, add_bust
from purva_netra.timing import valid_date


def test_valid_date_mapping_known_init():
    assert valid_date(pd.Timestamp("2022-08-14T00"), 5) == pd.Timestamp("2022-08-19")


def _labelled(t, train_years):
    t = add_log_error(t)
    thr, _ = fit_thresholds(t[t.init.dt.year.isin(train_years) & t.o_rain.notna()])
    return add_bust(t, thr)


def test_no_nan_labels_where_truth_exists(synthetic_table, cfg):
    t = _labelled(synthetic_table, cfg["years"]["train"])
    assert (t[t.o_rain.notna()].bust.isin([0, 1])).all()


def test_base_rate_per_lead_synthetic(synthetic_table, cfg):
    t = _labelled(synthetic_table, cfg["years"]["train"])
    br = t[t.bust >= 0].groupby("lead").bust.mean()
    assert br.between(0.03, 0.12).all(), br   # floor (5 mm) removes some of the 10% by construction


def test_base_rate_per_lead_real(real_table):
    """Spec §10: base rate per lead within 5–12% (on the real archive)."""
    years = sorted(real_table.init.dt.year.unique())
    t = _labelled(real_table, years)            # thin slice: in-sample thresholds (plumbing check)
    br = t[t.bust >= 0].groupby("lead").bust.mean()
    assert br.between(0.05, 0.12).all(), br


def test_unlabelled_rows_marked(synthetic_table, cfg):
    t = synthetic_table.copy(); t.loc[t.index[:10], "o_rain"] = np.nan
    t = _labelled(t, cfg["years"]["train"])
    assert (t.loc[t.index[:10], "bust"] == -1).all()
