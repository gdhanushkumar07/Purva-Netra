from functools import lru_cache
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]


@lru_cache
def load_config(path: str | None = None) -> dict:
    cfg = yaml.safe_load(open(path or ROOT / "configs" / "base.yaml"))
    for k, v in cfg["paths"].items():
        if not v.startswith(("gs://", "http")):
            cfg["paths"][k] = str(ROOT / v)
    return cfg


def year_split(year: int, cfg: dict | None = None) -> str:
    cfg = cfg or load_config()
    for name in ("train", "calib", "test", "oos"):
        if year in cfg["years"][name]:
            return name
    return "none"
