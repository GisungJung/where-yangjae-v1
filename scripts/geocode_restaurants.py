#!/usr/bin/env python3
"""Geocode restaurants via Kakao Local API and emit migration SQL.

Run:
    python3 scripts/geocode_restaurants.py

Reads .env for VITE_KAKAO_MAP_KEY and SUPABASE_DB_PASSWORD.
Generates supabase/migrations/20260514120005_coords.sql.
Registers the migration in supabase_migrations.schema_migrations.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pg8000

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
MIG_PATH = ROOT / "supabase" / "migrations" / "20260514120005_coords.sql"

YJ_X = 127.0359  # 양재역 lng
YJ_Y = 37.4837   # 양재역 lat
RADIUS = 2000    # 2 km
SLEEP = 0.1
KA_HEADER = "sdk/1.0.0 os/javascript lang/ko origin/http://localhost:5173"
FOOD_CATS = {"FD6", "CE7"}  # 음식점, 카페


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def normalize_name(name: str) -> str:
    # remove [..] brackets and extra spaces, but keep core name
    cleaned = re.sub(r"\[[^\]]*\]", " ", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


class KakaoClient:
    def __init__(self, key: str):
        self.key = key
        self.calls = 0
        self.errors = 0
        self.total_ms = 0.0

    def search(self, query: str, *, radius: int | None = RADIUS) -> dict:
        params: dict[str, str] = {
            "query": query,
            "size": "10",
        }
        if radius is not None:
            params.update({
                "x": str(YJ_X),
                "y": str(YJ_Y),
                "radius": str(radius),
                "sort": "distance",
            })
        url = "https://dapi.kakao.com/v2/local/search/keyword.json?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"KakaoAK {self.key}",
                "KA": KA_HEADER,
            },
        )
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read().decode("utf-8"))
            self.calls += 1
            self.total_ms += (time.time() - t0) * 1000
            return data
        except urllib.error.HTTPError as e:
            self.calls += 1
            self.errors += 1
            self.total_ms += (time.time() - t0) * 1000
            body = e.read().decode("utf-8", errors="replace")[:200]
            return {"_error": f"{e.code}: {body}", "documents": [], "meta": {"total_count": 0}}
        except Exception as e:  # noqa: BLE001
            self.calls += 1
            self.errors += 1
            return {"_error": repr(e), "documents": [], "meta": {"total_count": 0}}


def pick_best(docs: list[dict]) -> dict | None:
    """Prefer FD6/CE7 docs; otherwise first."""
    food = [d for d in docs if d.get("category_group_code") in FOOD_CATS]
    if food:
        return food[0]
    return docs[0] if docs else None


def main() -> int:
    env = load_env()
    key = env.get("VITE_KAKAO_MAP_KEY")
    pwd = env.get("SUPABASE_DB_PASSWORD")
    if not key or not pwd:
        print("Missing VITE_KAKAO_MAP_KEY or SUPABASE_DB_PASSWORD in .env", file=sys.stderr)
        return 2

    conn = pg8000.connect(
        user="postgres.hkmtclkeuscfvmtvnzwn",
        password=pwd,
        host="aws-1-ap-southeast-2.pooler.supabase.com",
        port=5432,
        database="postgres",
        ssl_context=True,
    )
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id::text, name, sheet_type, direction
        FROM restaurants
        WHERE lat IS NULL OR lng IS NULL
        ORDER BY sheet_type, name;
        """
    )
    rows = cur.fetchall()
    print(f"[info] {len(rows)} restaurants pending geocode", flush=True)

    kakao = KakaoClient(key)
    updates: list[dict] = []   # successful matches
    misses: list[dict] = []     # failed matches
    ambiguous: list[dict] = []  # multi-candidate ambiguity
    consecutive_errors = 0
    abort = False

    for idx, (rid, name, sheet, direction) in enumerate(rows, 1):
        normalized = normalize_name(name)
        query1 = f"{normalized} 양재"
        result = kakao.search(query1, radius=RADIUS)
        if "_error" in result:
            consecutive_errors += 1
        else:
            consecutive_errors = 0
        if consecutive_errors >= 5:
            print(f"[abort] 5 consecutive API errors; stopping at #{idx}", file=sys.stderr)
            abort = True
            break

        docs = result.get("documents", [])
        used_fallback = False
        if not docs:
            time.sleep(SLEEP)
            result2 = kakao.search(normalized, radius=None)
            docs = result2.get("documents", [])
            used_fallback = True

        best = pick_best(docs)
        if best is None:
            misses.append({"id": rid, "name": name, "normalized": normalized})
            print(f"[miss {idx:3d}/{len(rows)}] {name} -> NOT FOUND", flush=True)
        else:
            try:
                lng = float(best["x"])
                lat = float(best["y"])
            except (KeyError, ValueError) as e:  # noqa: BLE001
                misses.append({"id": rid, "name": name, "normalized": normalized, "reason": repr(e)})
                print(f"[miss {idx:3d}/{len(rows)}] {name} -> bad coords {e}", flush=True)
            else:
                dist = haversine(lat, lng, YJ_Y, YJ_X)
                updates.append({
                    "id": rid,
                    "name": name,
                    "lat": lat,
                    "lng": lng,
                    "place_name": best.get("place_name", ""),
                    "address": best.get("road_address_name") or best.get("address_name") or "",
                    "kakao_place_id": str(best.get("id") or ""),
                    "distance_m": dist,
                    "fallback": used_fallback,
                    "candidate_count": len(docs),
                })
                if len(docs) >= 3:
                    ambiguous.append({
                        "name": name,
                        "picked": best.get("place_name", ""),
                        "address": best.get("road_address_name") or best.get("address_name") or "",
                        "n": len(docs),
                    })
                tag = "fb" if used_fallback else "ok"
                print(
                    f"[{tag}  {idx:3d}/{len(rows)}] {name} -> {best.get('place_name','')} "
                    f"({lat:.5f},{lng:.5f}) d={dist:.0f}m n={len(docs)}",
                    flush=True,
                )

        # rate guard
        time.sleep(SLEEP)

    # interim stats
    total = len(rows)
    matched = len(updates)
    miss = len(misses)
    miss_rate = miss / total if total else 0.0
    print(
        f"[stats] matched={matched} miss={miss} miss_rate={miss_rate:.1%} "
        f"calls={kakao.calls} errors={kakao.errors} "
        f"avg_ms={kakao.total_ms/max(kakao.calls,1):.0f}",
        flush=True,
    )
    if miss_rate > 0.30:
        print("[WARN] miss rate exceeds 30% threshold", file=sys.stderr)
    if abort:
        print("[stop] aborted before completion; not writing migration", file=sys.stderr)
        conn.close()
        return 3

    # build migration SQL
    sql_lines: list[str] = []
    sql_lines.append("-- Generated by scripts/geocode_restaurants.py on 2026-05-14")
    sql_lines.append("-- Backfill lat/lng/kakao_place_id for restaurants inserted in 20260514120004_real_data.sql")
    sql_lines.append("-- Idempotent: same UPDATE applied repeatedly is safe.")
    sql_lines.append("")
    sql_lines.append("BEGIN;")
    sql_lines.append("")
    for u in updates:
        comment = f"-- {u['name']} -> {u['place_name']} ({u['address']}) d={u['distance_m']:.0f}m"
        sql_lines.append(comment)
        sql_lines.append(
            f"UPDATE restaurants SET lat={u['lat']:.7f}, lng={u['lng']:.7f}, "
            f"kakao_place_id={pg_str(u['kakao_place_id'])} "
            f"WHERE id='{u['id']}';"
        )
    if misses:
        sql_lines.append("")
        sql_lines.append("-- Unmatched restaurants (kept lat/lng NULL):")
        for m in misses:
            sql_lines.append(f"-- NOT FOUND: {m['name']} (id={m['id']})")
    sql_lines.append("")
    sql_lines.append("COMMIT;")
    sql_lines.append("")
    sql_text = "\n".join(sql_lines)
    MIG_PATH.write_text(sql_text, encoding="utf-8")
    print(f"[write] {MIG_PATH} ({len(sql_text)} bytes)")

    # apply via pg8000 transaction
    print("[apply] executing UPDATEs ...")
    cur.execute("BEGIN;")
    try:
        for u in updates:
            cur.execute(
                "UPDATE restaurants SET lat=%s, lng=%s, kakao_place_id=%s WHERE id=%s::uuid;",
                (u["lat"], u["lng"], u["kakao_place_id"] or None, u["id"]),
            )
        # register migration
        cur.execute(
            "CREATE SCHEMA IF NOT EXISTS supabase_migrations;"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
              version text PRIMARY KEY,
              statements text[],
              name text
            );
            """
        )
        cur.execute(
            """
            INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
            VALUES (%s, %s, %s)
            ON CONFLICT (version) DO UPDATE
              SET name = EXCLUDED.name,
                  statements = EXCLUDED.statements;
            """,
            ("20260514120005", "coords", [sql_text]),
        )
        cur.execute("COMMIT;")
    except Exception:
        cur.execute("ROLLBACK;")
        conn.close()
        raise

    # validation
    cur.execute(
        """
        SELECT COUNT(*) AS total,
               COUNT(lat) AS filled,
               COUNT(*) FILTER (WHERE lat IS NULL) AS missing
        FROM restaurants;
        """
    )
    total_r, filled_r, missing_r = cur.fetchone()
    print(f"[verify] total={total_r} filled={filled_r} missing={missing_r}")

    # outliers
    cur.execute(
        """
        SELECT name, lat, lng,
          6371000 * 2 * asin(sqrt(
            sin(radians((lat - 37.4837)/2))^2
            + cos(radians(37.4837)) * cos(radians(lat))
              * sin(radians((lng - 127.0359)/2))^2
          )) AS dist
        FROM restaurants
        WHERE lat IS NOT NULL
        ORDER BY dist DESC
        LIMIT 10;
        """
    )
    outliers = cur.fetchall()
    cur.execute(
        """
        SELECT AVG(
          6371000 * 2 * asin(sqrt(
            sin(radians((lat - 37.4837)/2))^2
            + cos(radians(37.4837)) * cos(radians(lat))
              * sin(radians((lng - 127.0359)/2))^2
          ))
        )
        FROM restaurants WHERE lat IS NOT NULL;
        """
    )
    avg_dist = cur.fetchone()[0]

    print(f"[dist] avg={avg_dist:.0f}m")
    print("[dist] top 10 farthest:")
    for name, lat, lng, dist in outliers:
        print(f"  {dist:6.0f}m  {name}  ({lat:.5f},{lng:.5f})")

    print("[ambiguous] candidates >=3:")
    for a in ambiguous[:5]:
        print(f"  {a['name']} -> {a['picked']} ({a['address']}) n={a['n']}")

    # final api stats
    print(
        f"[api] calls={kakao.calls} errors={kakao.errors} "
        f"avg_ms={kakao.total_ms/max(kakao.calls,1):.0f}"
    )

    conn.close()
    return 0


def pg_str(s: str) -> str:
    if s is None or s == "":
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


if __name__ == "__main__":
    sys.exit(main())
