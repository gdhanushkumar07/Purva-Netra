"""Generate notebooks 01 (cloud extraction), 10 (EDA/sanity) and 20 (results). Executed with nbconvert."""
import nbformat as nbf
C, M = nbf.v4.new_code_cell, nbf.v4.new_markdown_cell

nb = nbf.v4.new_notebook()
nb.cells = [
 M("# 01 · Full-archive extraction on a cloud VM / Colab\n"
   "The development laptop reads the public WB2 bucket at ≈1.9 MB/s; the ENS needs ≈240 MB of chunks per init "
   "(T6), i.e. ≈876 GB for 2018–2022. Run this on a machine in or near GCP (Colab or a small VM). "
   "It is resumable (one Parquet/npz per init) — copy `data/interim/fcst` and `data/interim/state` back afterwards."),
 C("!git clone <your-remote>/purva-netra.git && cd purva-netra && pip -q install -e .\n"
   "# IMD truth + masks are small; build them first so weights exist\n"
   "!cd purva-netra && make truth"),
 C("# Split by year across parallel processes (each is independent and resumable)\n"
   "import subprocess\n"
   "procs = [subprocess.Popen(['scripts/extract_loop.sh', f'{y}-01-01', f'{y}-12-31'], cwd='purva-netra') for y in range(2018, 2023)]\n"
   "procs += [subprocess.Popen(['.venv/bin/python','-m','purva_netra.extract_state', f'{y}-01-01', f'{y}-12-31'], cwd='purva-netra') for y in range(2018, 2023)]\n"
   "[p.wait() for p in procs]"),
]
nbf.write(nb, "notebooks/01_extract_colab.ipynb")

nb = nbf.v4.new_notebook()
nb.cells = [
 M("# 10 · EDA and sanity checks (spec §4.4)\nDay-1 HRES forecast vs IMD observed, land-only subdivision means, "
   "for three subdivisions. If they do not visibly track, alignment or units are wrong."),
 C("import pandas as pd, matplotlib.pyplot as plt, numpy as np\n"
   "from purva_netra.labels import add_log_error\n"
   "t = add_log_error(pd.read_parquet('../data/processed/table.parquet'))\n"
   "import json\n"
   "names = {f['properties']['rid']: f['properties']['name'] for f in json.load(open('../configs/regions/imd_subdivisions.geojson'))['features']}\n"
   "print('period', t.init.min(), '→', t.init.max(), '| inits', t.init.nunique(), '| rows', len(t))"),
 C("sel = [30, 8, 11]   # Kerala, Vidarbha, Assam & Meghalaya\n"
   "d1 = t[(t.lead == 1) & (t.init.dt.hour == 0)]\n"
   "fig, axs = plt.subplots(3, 1, figsize=(9, 7), sharex=True)\n"
   "for ax, r in zip(axs, sel):\n"
   "    s = d1[d1.rid == r].sort_values('valid_date')\n"
   "    ax.plot(s.valid_date, s.f_rain, color='#2a78d6', lw=2, label='HRES Day 1')\n"
   "    ax.plot(s.valid_date, s.o_rain, color='#eb6834', lw=2, label='IMD observed')\n"
   "    ax.set_title(f\"{names[r].title()}  (r = {s.f_rain.corr(s.o_rain):.2f})\", loc='left', fontsize=10)\n"
   "    ax.set_ylabel('mm / 24 h'); ax.grid(color='#e1e0d9', lw=0.5)\n"
   "axs[0].legend(frameon=False, ncol=2); plt.tight_layout(); plt.savefig('../docs/sanity_day1.png', dpi=110)"),
 C("print('Day-1 correlation f_rain vs o_rain, all assessed regions:', round(d1.f_rain.corr(d1.o_rain), 3))\n"
   "print('Mean f_rain vs o_rain (mm):', round(d1.f_rain.mean(), 2), round(d1.o_rain.mean(), 2))\n"
   "t.groupby('lead').apply(lambda g: pd.Series(dict(corr=g.f_rain.corr(g.o_rain), mae=(g.f_rain-g.o_rain).abs().mean()))).round(3)"),
]
nbf.write(nb, "notebooks/10_eda_errors.ipynb")

nb = nbf.v4.new_notebook()
nb.cells = [
 M("# 20 · Results (spec §9)\nAll numbers here are computed by `purva_netra.pipeline` on **held-out years only** "
   "(primary: train 2018–2020, calibration 2021, test 2022; plus leave-one-year-out). Brier/BSS from `scores` and "
   "scikit-learn (cross-checked), reliability from `xskillscore`, CIs by whole-week block bootstrap. "
   "If the archive is incomplete this notebook says so and reports nothing."),
 C("import json, pandas as pd, numpy as np, matplotlib.pyplot as plt\nfrom pathlib import Path\n"
   "P = Path('../data/processed/eval/results.json')\nHAVE = P.exists()\n"
   "print('results available:', HAVE)\nif not HAVE:\n"
   "    print('NOT RUN: the 2018–2022 archive has not been extracted yet (see README → Status). No skill numbers are reported.')"),
 C("if HAVE:\n    R = json.load(open(P))\n    print('shipped:', R['shipped'], '| gate passed:', R['gate_passed'], '| version:', R['version'])\n"
   "    print('features:', R['features'])\n    display(pd.DataFrame(R['base_rate']).round(3))"),
 M("## Primary split (test 2022): BSS vs B0 and B2 with 95% week-block CIs, ROC/PR-AUC, ECE, hit rate @ 20% FAR"),
 C("if HAVE:\n    display(pd.DataFrame(R['primary']).round(4))"),
 M("## Skill by lead (test 2022)"),
 C("if HAVE:\n    bl = pd.DataFrame(R['primary_by_lead'])\n    display(bl.round(3))\n"
   "    fig, ax = plt.subplots(figsize=(8,4))\n"
   "    for m, c in [('b2', '#eb6834'), ('m', '#1baf7a')]:\n"
   "        s = bl[bl.model == m]\n"
   "        ax.errorbar(s.lead, s.bss_b0, yerr=[s.bss_b0 - s.lo_b0, s.hi_b0 - s.bss_b0], color=c, lw=2, capsize=3, label={'b2':'B2 spread','m':'model'}[m])\n"
   "    ax.axhline(0, color='#2a78d6', lw=1, label='B0 climatology'); ax.set_xlabel('lead day'); ax.set_ylabel('BSS vs B0'); ax.legend(frameon=False)"),
 M("## Leave-one-year-out and the §9 gate (BSS vs B2, lower 95% bound > 0 for Day 3–10)"),
 C("if HAVE and R['loyo_by_lead']:\n    lb = pd.DataFrame(R['loyo_by_lead'])\n    g = lb[(lb.model == 'm') & lb.lead.between(3, 10)][['lead','bss_b2','lo_b2','hi_b2']]\n"
   "    display(g.round(4)); print('GATE PASSED' if (g.lo_b2 > 0).all() and len(g) == 8 else 'GATE NOT PASSED — ship B2 + analogs + calibration')\n"
   "    display(pd.DataFrame(R['loyo']).round(4))"),
 M("## Reliability (test 2022, 10 bins) — xskillscore vs scikit-learn cross-check"),
 C("if HAVE:\n    from purva_netra.evaluate import library_report\n"
   "    pr = pd.read_parquet('../data/processed/eval/primary_predictions.parquet')\n"
   "    te = pr[(pr.init.dt.year == 2022) & (pr.bust >= 0) & pr.p_b2.notna()]\n"
   "    fig, ax = plt.subplots(figsize=(5,5)); ax.plot([0,1],[0,1], ls='--', color='#898781')\n"
   "    for col, c, lab in [('p_b2','#eb6834','B2'), ('p_m','#1baf7a','model')]:\n"
   "        rep, rel, (fp, mp, n) = library_report(te, col)\n"
   "        ax.plot(mp, fp, marker='o', color=c, label=f\"{lab} (ECE {rep['ece']:.3f})\")\n"
   "        print(lab, {k: round(v, 4) for k, v in rep.items()})\n"
   "    ax.set_xlabel('forecast P(bust)'); ax.set_ylabel('observed frequency'); ax.legend(frameon=False)"),
 M("## hi_bust (heavy-rain miss / false alarm): ROC-AUC and PR-AUC of P(bust) and of the ▲ rule"),
 C("if HAVE:\n    from sklearn.metrics import roc_auc_score, average_precision_score\n"
   "    h = te[te.hi_bust.notna()]\n    print('hi_bust base rate', round(h.hi_bust.mean(), 4))\n"
   "    for col in ['p_b2', 'p_m']:\n        print(col, 'ROC', round(roc_auc_score(h.hi_bust, h[col]), 4), 'PR', round(average_precision_score(h.hi_bust, h[col]), 4))"),
 M("## Error heads: pinball loss (q50, q90) by lead"),
 C("if HAVE:\n    from sklearn.metrics import mean_pinball_loss\n"
   "    display(te.groupby('lead').apply(lambda g: pd.Series(dict(q50=mean_pinball_loss(g.log_err, g.err_q50, alpha=0.5), q90=mean_pinball_loss(g.log_err, g.err_q90, alpha=0.9), cover90=(g.log_err <= g.err_q90).mean()))).round(4))"),
 M("## Ablations A1–A7 (definitions frozen in `configs/ablations.yaml`)"),
 C("if HAVE:\n    import yaml\n    ab = yaml.safe_load(open('../configs/ablations.yaml'))['ablations']\n"
   "    st = pd.DataFrame(R['primary']).set_index('model')\n"
   "    rows = [dict(ablation=k, desc=v['desc'], **st.loc[k, ['bss_b0','bss_b2','bss_b2_lo','bss_b2_hi','pr_auc']].to_dict()) for k, v in ab.items() if k in st.index]\n"
   "    display(pd.DataFrame(rows).round(4))"),
 M("## Case studies (frozen list, `configs/cases.yaml`)"),
 C("if HAVE:\n    import yaml\n    cases = yaml.safe_load(open('../configs/cases.yaml'))['cases']\n"
   "    allp = pd.read_parquet('../data/processed/eval/loyo_predictions.parquet')\n"
   "    for c in cases:\n        s = allp[allp.init == pd.Timestamp(c['init'])]\n"
   "        if len(s): print(c['name'], '| split', c['split'], '| Brier model', round(((s.p_m - s.bust)**2).mean(), 4), '| B2', round(((s.p_b2 - s.bust)**2).mean(), 4), '| busts', int(s.bust.sum()))"),
]
nbf.write(nb, "notebooks/20_results.ipynb")
