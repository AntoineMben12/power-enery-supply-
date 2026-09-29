/**
 * Store factory.
 *
 * The rest of the application only ever sees a store interface, so PowerWatch
 * runs against MySQL when it is configured and reachable, and against the
 * in-memory store otherwise (demo machines, CI, the test suite).
 */

const path = require("path");
const MemoryStore = require("./memoryStore");

function createPool(config) {
  // mysql2 is an optional runtime dependency in demo mode, so load it lazily.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const mysql = require("mysql2/promise");
  return mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: false,
    multipleStatements: true // required only by schema.sql bootstrap
  });
}

/** Applies server/schema.sql to an empty database (idempotent statements). */
async function bootstrapSchema(pool, schemaFile = path.join(__dirname, "..", "schema.sql")) {
  const fs = require("fs/promises");
  const sql = await fs.readFile(schemaFile, "utf8");
  await pool.query(sql);
}

async function createStore(config, { log = console } = {}) {
  if (config.storage.driver === "memory") {
    log.log?.("[store] using in-memory store (STORAGE_DRIVER=memory)");
    return new MemoryStore({ clusterConfig: config.cluster });
  }

  try {
    const pool = createPool(config);
    await pool.query("SELECT 1");
    const MySqlStore = require("./mysqlStore");
    const store = new MySqlStore(pool);
    if (config.db.bootstrap) {
      try {
        await bootstrapSchema(pool);
      } catch (error) {
        log.warn?.(`[store] schema bootstrap skipped: ${error.message}`);
      }
    }
    log.log?.(`[store] connected to MySQL ${config.db.host}:${config.db.port}/${config.db.database}`);
    return store;
  } catch (error) {
    if (config.storage.driver === "mysql" || config.storage.strict) throw error;
    log.warn?.(`[store] MySQL unavailable (${error.code || error.message}) — falling back to the in-memory store`);
    return new MemoryStore({ clusterConfig: config.cluster });
  }
}

module.exports = { createStore, createPool, bootstrapSchema };
