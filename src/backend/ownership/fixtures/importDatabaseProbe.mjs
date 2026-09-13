import Database from "better-sqlite3";

let database;
try {
  database = new Database(process.argv[2], { timeout: 0, fileMustExist: true });
  database.pragma("quick_check");
  console.log(JSON.stringify({ status: "readable" }));
} catch (error) {
  console.log(JSON.stringify({ status: "refused", code: error.code }));
} finally {
  database?.close();
}
