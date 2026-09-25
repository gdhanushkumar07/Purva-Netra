"""The single place where forecast windows are mapped onto IMD rain days.

IMD's rain day D is the 24 h ending 03 UTC on D (08:30 IST). WB2 `total_precipitation_24hr`
at lead L is the 24 h ending at init + L. We map a forecast to the IMD day on which its window
ends: valid_date = floor(init + L). Offsets vs IMD: 00 UTC inits end 3 h early; 12 UTC inits end
9 h after the IMD day closes (documented limitation, see README).
"""
import pandas as pd


def valid_date(init, lead_days):
    init = pd.to_datetime(init)
    return (init + pd.to_timedelta(lead_days, unit="D")).dt.floor("D") if hasattr(init, "dt") \
        else (init + pd.Timedelta(days=int(lead_days))).floor("D")


def offset_hours(init_hour: int) -> int:
    """Hours by which the forecast window end differs from the IMD day end (03 UTC)."""
    return {0: -3, 12: 9}[init_hour]
