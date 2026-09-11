import os
import sys
import argparse
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, "/tmp/improinvestor_parquet_deps")

import pyarrow as pa
import pyarrow.parquet as pq
import psycopg


BATCH_SIZE = 100_000


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def as_float(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def table_from_rows(rows):
    columns = list(zip(*rows, strict=True)) if rows else [[] for _ in range(len(SCHEMA))]
    return pa.table(
        {
            "exchange": pa.array(columns[0], type=pa.string()),
            "symbol": pa.array(columns[1], type=pa.string()),
            "instrument_key": pa.array(columns[2], type=pa.string()),
            "isin": pa.array(columns[3], type=pa.string()),
            "company_name": pa.array(columns[4], type=pa.string()),
            "trading_date": pa.array(columns[5], type=pa.date32()),
            "open": pa.array([as_float(value) for value in columns[6]], type=pa.float64()),
            "high": pa.array([as_float(value) for value in columns[7]], type=pa.float64()),
            "low": pa.array([as_float(value) for value in columns[8]], type=pa.float64()),
            "close": pa.array([as_float(value) for value in columns[9]], type=pa.float64()),
            "volume": pa.array(columns[10], type=pa.int64()),
            "market_data_source": pa.array(columns[11], type=pa.string()),
        },
        schema=SCHEMA,
    )


def price_only_table_from_rows(rows):
    columns = list(zip(*rows, strict=True)) if rows else [[] for _ in range(len(SCHEMA))]
    return pa.table(
        {
            "exchange": pa.array(columns[0], type=pa.string()),
            "symbol": pa.array(columns[1], type=pa.string()),
            "instrument_key": pa.array(columns[2], type=pa.string()),
            "trading_date": pa.array(columns[5], type=pa.date32()),
            "open": pa.array([as_float(value) for value in columns[6]], type=pa.float64()),
            "high": pa.array([as_float(value) for value in columns[7]], type=pa.float64()),
            "low": pa.array([as_float(value) for value in columns[8]], type=pa.float64()),
            "close": pa.array([as_float(value) for value in columns[9]], type=pa.float64()),
            "volume": pa.array(columns[10], type=pa.int64()),
        },
        schema=PRICE_ONLY_SCHEMA,
    )


SCHEMA = pa.schema(
    [
        ("exchange", pa.string()),
        ("symbol", pa.string()),
        ("instrument_key", pa.string()),
        ("isin", pa.string()),
        ("company_name", pa.string()),
        ("trading_date", pa.date32()),
        ("open", pa.float64()),
        ("high", pa.float64()),
        ("low", pa.float64()),
        ("close", pa.float64()),
        ("volume", pa.int64()),
        ("market_data_source", pa.string()),
    ]
)

PRICE_ONLY_SCHEMA = pa.schema(
    [
        ("exchange", pa.string()),
        ("symbol", pa.string()),
        ("instrument_key", pa.string()),
        ("trading_date", pa.date32()),
        ("open", pa.float64()),
        ("high", pa.float64()),
        ("low", pa.float64()),
        ("close", pa.float64()),
        ("volume", pa.int64()),
    ]
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export UPSTOX_REAL daily OHLCV rows to Parquet.")
    parser.add_argument("--start-date", required=True, help="Inclusive start date in YYYY-MM-DD format.")
    parser.add_argument("--end-date", required=True, help="Inclusive end date in YYYY-MM-DD format.")
    parser.add_argument("--output", required=True, help="Output Parquet file path.")
    parser.add_argument("--price-only", action="store_true", help="Exclude company metadata columns.")
    args = parser.parse_args()

    load_dotenv(Path(".env"))
    database_url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL or DIRECT_URL is required.")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    schema = PRICE_ONLY_SCHEMA if args.price_only else SCHEMA
    query = """
        select
          i.exchange::text as exchange,
          i.symbol,
          i."instrumentKey" as instrument_key,
          c.isin,
          c.name as company_name,
          dp."tradingDate" as trading_date,
          dp.open,
          dp.high,
          dp.low,
          dp.close,
          dp.volume,
          dp."marketDataSource"::text as market_data_source
        from "DailyPrice" dp
        join "Instrument" i on i.id = dp."instrumentId"
        join "Company" c on c.id = i."companyId"
        where dp."marketDataSource" = 'UPSTOX_REAL'
          and dp."tradingDate" between %(start_date)s and %(end_date)s
        order by i.exchange, i.symbol, dp."tradingDate"
    """

    total_rows = 0
    with psycopg.connect(database_url) as conn:
        with conn.cursor(name="upstox_parquet_export") as cur:
            cur.itersize = BATCH_SIZE
            cur.execute(query, {"start_date": args.start_date, "end_date": args.end_date})
            writer = pq.ParquetWriter(
                output,
                schema,
                compression="zstd",
                use_dictionary=["exchange", "symbol", "instrument_key"] if args.price_only else [
                    "exchange",
                    "symbol",
                    "instrument_key",
                    "isin",
                    "company_name",
                    "market_data_source",
                ],
            )
            try:
                while True:
                    rows = cur.fetchmany(BATCH_SIZE)
                    if not rows:
                        break
                    table = price_only_table_from_rows(rows) if args.price_only else table_from_rows(rows)
                    writer.write_table(table, row_group_size=len(rows))
                    total_rows += len(rows)
                    print(f"exported_rows={total_rows}", flush=True)
            finally:
                writer.close()

    print(f"parquet_path={output.resolve()}")
    print(f"rows={total_rows}")
    print(f"size_bytes={output.stat().st_size}")


if __name__ == "__main__":
    main()
