"""Code-path smoke test of one fold on SYNTHETIC data (no skill claims; checks shapes and contracts)."""
import numpy as np

from purva_netra.labels import add_log_error
from purva_netra.features import add_revision, add_flipflop
from purva_netra.pipeline import fold_features, run_fold, score_table, by_lead, gate
from purva_netra.predict import finalize, add_change_vs_prev


def test_fold_runs_end_to_end(synthetic_table, cfg):
    t = add_flipflop(add_revision(add_log_error(synthetic_table)))
    d, art = fold_features(t, cfg, cfg["years"]["train"], S=None)
    pr, models = run_fold(d, cfg["years"]["train"], cfg["years"]["calib"], cfg["years"]["test"], ablate=True)
    test = pr[pr.init.dt.year.isin(cfg["years"]["test"]) & (pr.bust >= 0)]
    for c in ["p_b0", "p_b2", "p_b2iso", "p_m", "p_m_raw", "p_A1", "p_A3", "p_A6", "p_A7", "err_q50", "err_q90"]:
        assert c in test and test[c].notna().all(), c
        assert ((test[c] >= 0) & ((test[c] <= 1) | c.startswith("err"))).all()
    assert (test.err_q90 >= test.err_q50 - 1e-6).mean() > 0.95
    assert set(art["threshold_meta"]["init_years"]) <= set(cfg["years"]["train"])
    st = score_table(test, ["p_b0", "p_b2", "p_m"], n_boot=50)
    assert {"bss_b2", "bss_b2_lo", "pr_auc"} <= set(st.columns)
    bl = by_lead(test, ["p_b2", "p_m"], n_boot=30)
    passed, m = gate(bl)
    assert isinstance(passed, bool) and len(m) == 8
    # synthetic spread carries the signal → the spread baseline must show positive skill vs climatology
    assert st.set_index("model").loc["b2", "bss_b0"] > 0
    out = finalize(test.head(50), test.p_m.head(50).to_numpy(), None, "rule")
    assert len(add_change_vs_prev(out)) == 50 and out.confidence.isin(["High", "Normal", "Reduced", "Low"]).all()
