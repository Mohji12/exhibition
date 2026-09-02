from collections.abc import Generator
from contextlib import contextmanager

import pymysql
from pymysql.cursors import DictCursor

from app.config import settings

_pool: pymysql.connections.Connection | None = None


def _connect() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=settings.database_host,
        port=settings.database_port,
        user=settings.database_user,
        password=settings.database_password,
        database=settings.database_name,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )


@contextmanager
def get_connection() -> Generator[pymysql.connections.Connection, None, None]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()
