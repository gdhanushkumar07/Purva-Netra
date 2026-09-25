"""Create / migrate data/ops/ops.db (idempotent). Usage: python scripts/init_ops_db.py"""
from purva_netra.ops.db import init_db
print("ops.db ready at", init_db())
