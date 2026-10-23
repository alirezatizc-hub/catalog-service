import pg from "pg";

const { Pool } = pg;
let pool;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

function getPool(env) {
  if (!env.HYPERDRIVE?.connectionString) return null;
  if (!pool) pool = new Pool({
    connectionString: env.HYPERDRIVE.connectionString,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false }
  });
  return pool;
}

async function databaseStatus(env) {
  const db = getPool(env);
  if (!db) return { configured: false, connected: false, error: "hyperdrive_binding_missing" };
  try {
    const result = await db.query(`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'
          AND tablename IN ('products','offers','shops')) AS recognized_tables,
        (SELECT COALESCE(json_object_agg(relname, GREATEST(reltuples, 0)::bigint), '{}'::json)
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
            AND c.relname IN ('products','offers','shops')) AS estimated_rows
    `);
    const row = result.rows[0];
    return {
      configured: true,
      connected: true,
      database: row.database,
      schema: row.schema,
      recognizedTables: Number(row.recognized_tables),
      estimatedRows: row.estimated_rows
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      error: "database_connection_failed",
      detail: String(error?.code || error?.message || "unknown").slice(0, 120)
    };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400"
    }});

    if (url.pathname === "/" || url.pathname === "/api/health" || url.pathname === "/api/meta") {
      const db = await databaseStatus(env);
      const body = {
        service: "torob-assistant-worker",
        runtime: "cloudflare-workers",
        phase: "migration-foundation",
        ok: db.connected,
        database: db,
        apiMigration: "incomplete"
      };
      return json(body, db.connected ? 200 : 503);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        error: "api_not_migrated",
        message: "این مسیر هنوز در مرحلهٔ مهاجرت به Cloudflare Workers پیاده‌سازی نشده است.",
        path: url.pathname
      }, 501);
    }

    return json({ error: "not_found" }, 404);
  }
};
