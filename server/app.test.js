const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { afterEach, beforeEach, test } = require("node:test");
const { createApp } = require("./app");
const { createDatabase } = require("./database");

let app;
let server;
let baseUrl;
let testDirectory;

beforeEach(async () => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "eat-n-split-"));
  app = createApp({ databasePath: path.join(testDirectory, "app.sqlite") });
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  app.closeDatabase();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

async function api(pathname, options) {
  return fetch(`${baseUrl}${pathname}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
}

test("lists the initial friends", async () => {
  const response = await api("/api/friends");
  assert.equal(response.status, 200);
  const friends = await response.json();
  assert.equal(friends.length, 3);
  assert.deepEqual(friends.map((friend) => friend.name), ["Clark", "Sarah", "Anthony"]);
});

test("creates a validated friend and returns it from the list", async () => {
  const createResponse = await api("/api/friends", {
    method: "POST", body: JSON.stringify({ name: "Mina", image: "https://example.test/mina.png" }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.name, "Mina");
  assert.equal(created.balance, 0);

  const friends = await (await api("/api/friends")).json();
  assert.ok(friends.some((friend) => friend.id === created.id));
});

test("seeds the default Pravatar URL with the new friend's ID", async () => {
  const createResponse = await api("/api/friends", {
    method: "POST", body: JSON.stringify({ name: "Ava", image: "https://i.pravatar.cc/48" }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.image, `https://i.pravatar.cc/48?u=${created.id}`);

  const friends = await (await api("/api/friends")).json();
  assert.equal(friends.find((friend) => friend.id === created.id).image, created.image);
});

test("migrates legacy unseeded Pravatar URLs", () => {
  const databasePath = path.join(testDirectory, "legacy.sqlite");
  const originalDb = createDatabase(databasePath);
  originalDb.prepare("UPDATE friends SET image = ? WHERE id = ?")
    .run("https://i.pravatar.cc/48", "118836");
  originalDb.close();

  const migratedDb = createDatabase(databasePath);
  const migrated = migratedDb.prepare("SELECT image FROM friends WHERE id = ?").get("118836");
  assert.equal(migrated.image, "https://i.pravatar.cc/48?u=118836");
  migratedDb.close();
});

test("rejects invalid friend input with a useful error", async () => {
  const response = await api("/api/friends", {
    method: "POST", body: JSON.stringify({ name: "", image: "javascript:alert(1)" }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Friend name is required.");
});

test("records a split and persists its balance update", async () => {
  const response = await api("/api/friends/118836/splits", {
    method: "POST", body: JSON.stringify({ bill: 40, paidByUser: 25, payer: "user" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).balance, 8);

  const friends = await (await api("/api/friends")).json();
  assert.equal(friends.find((friend) => friend.id === "118836").balance, 8);

  const persistedDb = new DatabaseSync(path.join(testDirectory, "app.sqlite"));
  assert.equal(persistedDb.prepare("SELECT balance FROM friends WHERE id = ?").get("118836").balance, 8);
  persistedDb.close();
});

test("rejects an invalid split and reports a missing friend", async () => {
  const invalidResponse = await api("/api/friends/118836/splits", {
    method: "POST", body: JSON.stringify({ bill: 10, paidByUser: 12, payer: "user" }),
  });
  assert.equal(invalidResponse.status, 400);

  const missingResponse = await api("/api/friends/not-here/splits", {
    method: "POST", body: JSON.stringify({ bill: 10, paidByUser: 5, payer: "friend" }),
  });
  assert.equal(missingResponse.status, 404);
  assert.equal((await missingResponse.json()).error, "Friend not found");
});
