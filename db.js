// db.js — loads trees.db with sql.js (a WebAssembly build of SQLite)
// and exposes a small async API for the rest of the site.
//
// Note: because this fetches a local file, the site must be served over
// http(s) (e.g. `python3 -m http.server`). Opening the HTML directly via
// file:// will fail to load the database in most browsers.

(function (global) {
  var SQL_JS_VERSION = '1.10.3';
  var SQL_JS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/' + SQL_JS_VERSION + '/';

  var dbPromise = null;
  var sqlJsScriptPromise = null;

  function loadSqlJsScript() {
    if (sqlJsScriptPromise) return sqlJsScriptPromise;
    sqlJsScriptPromise = new Promise(function (resolve, reject) {
      if (typeof initSqlJs === 'function') {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = SQL_JS_BASE + 'sql-wasm.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load sql.js')); };
      document.head.appendChild(s);
    });
    return sqlJsScriptPromise;
  }

  function loadDb() {
    if (dbPromise) return dbPromise;
    dbPromise = loadSqlJsScript().then(function () {
      var sqlPromise = initSqlJs({
        locateFile: function (file) { return SQL_JS_BASE + file; }
      });
      var dataPromise = fetch('trees.db').then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch trees.db: ' + res.status);
        return res.arrayBuffer();
      });
      return Promise.all([sqlPromise, dataPromise]).then(function (results) {
        var SQL = results[0];
        var buf = results[1];
        return new SQL.Database(new Uint8Array(buf));
      });
    });
    return dbPromise;
  }

  // Convert a sql.js result row to a plain object whose values are strings
  // (matching the shape the existing render code expects). NULLs become "".
  function rowToObject(stmt) {
    var cols = stmt.getColumnNames();
    var values = stmt.get();
    var obj = {};
    for (var i = 0; i < cols.length; i++) {
      var v = values[i];
      obj[cols[i]] = (v === null || v === undefined) ? '' : String(v);
    }
    return obj;
  }

  function parseId(id) {
    var n = parseInt(String(id).replace(/^0+/, '') || '0', 10);
    return isNaN(n) ? null : n;
  }

  var TreeDB = {
    getTree: function (id) {
      var n = parseId(id);
      if (n === null) return Promise.resolve(null);
      return loadDb().then(function (db) {
        var stmt = db.prepare('SELECT * FROM trees WHERE tree_id = ?');
        stmt.bind([n]);
        var result = null;
        if (stmt.step()) {
          result = rowToObject(stmt);
        }
        stmt.free();
        return result;
      });
    },

    hasTree: function (id) {
      var n = parseId(id);
      if (n === null) return Promise.resolve(false);
      return loadDb().then(function (db) {
        var stmt = db.prepare('SELECT 1 FROM trees WHERE tree_id = ?');
        stmt.bind([n]);
        var exists = stmt.step();
        stmt.free();
        return exists;
      });
    },

    // Return every tree ordered by tree_id, with just the columns the
    // homepage list needs.
    listTrees: function () {
      return loadDb().then(function (db) {
        var stmt = db.prepare(
          'SELECT tree_id, tree_name, dedication_type, age_class ' +
          'FROM trees ORDER BY tree_id'
        );
        var rows = [];
        while (stmt.step()) {
          rows.push(rowToObject(stmt));
        }
        stmt.free();
        return rows;
      });
    }
  };

  global.TreeDB = TreeDB;
})(window);
