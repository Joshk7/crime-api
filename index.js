import * as path from "node:path";
import * as url from "node:url";

import { default as express } from "express";
import { default as sqlite3 } from "sqlite3";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db_filename = path.join(__dirname, "db", "stpaul_crime.sqlite3");

const port = 8000;

let app = express();
app.use(express.json());

let db = new sqlite3.Database(db_filename, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.log("Error opening " + path.basename(db_filename));
  } else {
    console.log("Now connected to " + path.basename(db_filename));
  }
});

// Create Promise for SQLite3 database SELECT query
function dbSelect(query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Create Promise for SQLite3 database INSERT or DELETE query
function dbRun(query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function buildFilterClause(filterKey, queryValue) {
  if (!queryValue) return { clause: "", params: [] };
  const values = queryValue.split(",");
  const conditions = values.map(() => "?").join(" , ");
  return {
    clause: `${filterKey} IN (${conditions})`,
    params: values,
  };
}

// GET request handler for crime incidents
app.get("/incidents", (req, res) => {
  let sql = "SELECT * FROM Incidents";
  let params = [];
  const filters = [];

  // Add filters for `code`, `neighborhood`, and `grid`
  ["code", "neighborhood", "grid"].forEach((key) => {
    let filterKey = key;
    if (filterKey === "neighborhood") {
      filterKey = "neighborhood_number";
    }

    if (filterKey === "grid") {
      filterKey = "police_grid";
    }
    const filter = buildFilterClause(filterKey, req.query[key]);
    if (filter.clause) {
      filters.push(filter.clause);
      params.push(...filter.params);
    }
  });

  if (req.query.start_date) {
    filters.push("date_time >= ?");
    params.push(req.query["start_date"].replaceAll("-", "/"));
  }

  if (req.query.end_date) {
    filters.push("date_time <= ?");
    params.push(req.query["end_date"].replaceAll("-", "/"));
  }

  if (filters.length) {
    sql += " WHERE " + filters.join(" AND ");
  }

  sql += ` ORDER BY date_time DESC`;

  // Add limit
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 1000;
  sql += ` LIMIT ${limit}`;

  dbSelect(sql, params)
    .then((results) => {
      results.forEach((item) => {
        item.date_time = item.date_time.replaceAll("/", "-");
      });

      res.status(200).type("json").send(results);
    })
    .catch((error) => {
      res.status(500).type("txt").send(error.message);
    });
});

// POST request handler for new crime incident
app.post("/new-incident", async (req, res) => {
  try {
    const newIncident = req.body;
    const params = [
      newIncident.case_number,
      `${newIncident.date} ${newIncident.time}`,
      newIncident.code,
      newIncident.incident,
      newIncident.police_grid,
      newIncident.neighborhood_number,
      newIncident.block,
    ];

    await dbRun(
      "INSERT INTO Incidents (case_number, date_time, code, incident, police_grid, neighborhood_number, block) VALUES (?,?,?,?,?,?,?)",
      params
    );

    res.status(200).type("txt").send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).type("txt").send(error.message);
  }
});

// DELETE request handler for new crime incident
app.delete("/remove-incident", async (req, res) => {
  try {
    const caseNumber = req.body.case_number;
    if (!caseNumber) throw new Error("Case number is required");

    const incident = await dbSelect(
      "SELECT * FROM Incidents WHERE case_number = ?",
      [caseNumber]
    );
    if (incident.length === 0) throw new Error("Case Number Not Found");

    await dbRun("DELETE FROM Incidents WHERE case_number = ?", [caseNumber]);
    console.log(`${caseNumber} has been deleted`);

    res
      .status(200)
      .type("txt")
      .send(`Case number ${caseNumber} has been deleted.`);
  } catch (error) {
    console.error(error.message);
    res.status(500).type("txt").send(error.message);
  }
});

app.listen(port, () => {
  console.log("Now listening on port " + port);
});
