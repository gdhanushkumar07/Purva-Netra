import pandas as pd
from purva_netra.timing import valid_date, offset_hours


def test_valid_date_known_init():
    assert valid_date(pd.Timestamp("2020-07-15T00"), 1) == pd.Timestamp("2020-07-16")
    assert valid_date(pd.Timestamp("2020-07-15T12"), 1) == pd.Timestamp("2020-07-16")
    assert valid_date(pd.Timestamp("2020-12-31T00"), 10) == pd.Timestamp("2021-01-10")
    s = valid_date(pd.Series(pd.to_datetime(["2020-07-15T00", "2020-07-15T12"])), pd.Series([5, 5]))
    assert list(s) == [pd.Timestamp("2020-07-20")] * 2


def test_offsets_documented():
    assert offset_hours(0) == -3 and offset_hours(12) == 9
