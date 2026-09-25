"""Reasons → fixed template sentences (English / Hindi). No generated free text anywhere.

Two sources of ranking, recorded per row in `reason_source`:
  * "shap": TreeSHAP group contributions of the LightGBM model (only groups that raise risk)
  * "rule": fixed thresholds on the row's own values (used when the shipped model is B2)
"""
import numpy as np

GROUPS = {
    "spread": ["spread_anom", "ens_log_spread", "hres_minus_em", "ens_iqr_rel", "p_heavy_member", "ens_heavy_frac"],
    "analogs": ["an_err_mean", "an_err_q90", "an_bust_rate"],
    "novelty": ["an_novelty"],
    "revision": ["rev12", "rev24", "ffi4"],
    "regime": ["regime", "low_bay", "low_arabian", "wd_trough", "heat"],
    "state": ["f_rain_anom", "q850_anom", "u850_anom", "mslp_min_anom"],
}
GROUP_LABELS = {
    "en": {"spread": "Ensemble disagreement", "analogs": "Similar past forecasts", "novelty": "Unusual pattern",
           "revision": "Forecast changing between cycles", "regime": "Weather regime", "state": "Unusual forecast rainfall",
           "season": "Season and lead time"},
    "hi": {"spread": "एन्सेम्बल में असहमति", "analogs": "मिलते-जुलते पिछले पूर्वानुमान", "novelty": "असामान्य पैटर्न",
           "revision": "चक्रों के बीच बदलता पूर्वानुमान", "regime": "मौसमी व्यवस्था", "state": "असामान्य पूर्वानुमानित वर्षा",
           "season": "मौसम और लीड समय"},
}
TEMPLATES = {
    "en": {
        "spread": "Members disagree more than usual for Day {lead} in {month_name} ({spread_anom:.1f}× normal spread).",
        "analogs": "{n_bust} of the {n} most similar past forecasts had large errors (e.g. {ex_date}).",
        "novelty": "Today's pattern is unlike past cases; the tool has little history to rely on.",
        "revision": "The forecast for this day changed noticeably since the previous cycle.",
        "regime": "{regime_sentence}",
        "state": "Forecast rainfall is far from normal for this region and season.",
    },
    "hi": {
        "spread": "{month_name_hi} में दिन {lead} के लिए सदस्यों में सामान्य से अधिक असहमति है (सामान्य स्प्रेड का {spread_anom:.1f} गुना)।",
        "analogs": "सबसे मिलते-जुलते {n} पिछले पूर्वानुमानों में से {n_bust} में बड़ी त्रुटि थी (जैसे {ex_date})।",
        "novelty": "आज का पैटर्न पिछले मामलों से अलग है; उपकरण के पास भरोसा करने लायक इतिहास कम है।",
        "revision": "इस दिन का पूर्वानुमान पिछले चक्र की तुलना में काफ़ी बदला है।",
        "regime": "{regime_sentence_hi}",
        "state": "इस क्षेत्र और मौसम के लिए पूर्वानुमानित वर्षा सामान्य से बहुत अलग है।",
    },
}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"]

# Fixed rule thresholds (used only when reason_source == "rule")
RULES = {"spread": ("spread_anom", 1.25), "revision": ("rev12", 0.4), "state": ("f_rain_anom", 1.0),
         "novelty": ("an_novelty", 2.0), "analogs": ("an_bust_rate", 0.2)}


def rule_groups(row) -> list[tuple[str, float]]:
    out = []
    for g, (col, thr) in RULES.items():
        v = row.get(col, np.nan)
        if v is not None and np.isfinite(v) and abs(v) > thr:
            out.append((g, abs(v) / thr))
    return sorted(out, key=lambda kv: -kv[1])[:3]


def shap_groups(clf, X, features):
    import shap
    sv = shap.TreeExplainer(clf).shap_values(X)
    sv = sv[1] if isinstance(sv, list) else sv
    idx = {g: [features.index(f) for f in fs if f in features] for g, fs in GROUPS.items()}
    out = []
    for i in range(len(X)):
        contrib = {g: float(sv[i, ix].sum()) for g, ix in idx.items() if ix}
        out.append(contrib)
    return out


def top_groups(contrib: dict, k=3):
    return [g for g, v in sorted(contrib.items(), key=lambda kv: -kv[1]) if v > 0][:k]


def sentence(group, row, lang="en", analog=None, regime_sentence=None):
    m = int(row["month"]) - 1
    ctx = dict(lead=int(row["lead"]), month_name=MONTHS[m], month_name_hi=MONTHS_HI[m],
               spread_anom=float(row.get("spread_anom", np.nan)))
    if group == "analogs":
        if not analog:
            return None
        ctx.update(n=analog["n"], n_bust=analog["n_bust"], ex_date=analog["ex_date"])
    if group == "regime":
        if not regime_sentence:
            return None
        ctx.update(regime_sentence=regime_sentence["en"], regime_sentence_hi=regime_sentence["hi"])
    return TEMPLATES[lang][group].format(**ctx)
