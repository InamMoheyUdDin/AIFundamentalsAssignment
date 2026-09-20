const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const initialFriends = [
  { id: "118836", name: "Clark", image: "https://i.pravatar.cc/48?u=118836", balance: -7 },
  { id: "933372", name: "Sarah", image: "https://i.pravatar.cc/48?u=933372", balance: 20 },
  { id: "499476", name: "Anthony", image: "https://i.pravatar.cc/48?u=499476", balance: 0 },
];

function createDatabase(filename) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS splits (
      id TEXT PRIMARY KEY,
      friend_id TEXT NOT NULL REFERENCES friends(id),
      bill REAL NOT NULL,
      paid_by_user REAL NOT NULL,
      paid_by_friend REAL NOT NULL,
      payer TEXT NOT NULL CHECK (payer IN ('user', 'friend')),
      balance_delta REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
  `);

  migrateUnseededPravatarUrls(db);

  const { count } = db.prepare("SELECT COUNT(*) AS count FROM friends").get();
  if (count === 0) {
    const insert = db.prepare("INSERT INTO friends (id, name, image, balance) VALUES (?, ?, ?, ?)");
    for (const friend of initialFriends) insert.run(friend.id, friend.name, friend.image, friend.balance);
  }

  return db;
}

function listFriends(db) {
  return db.prepare("SELECT id, name, image, balance FROM friends ORDER BY rowid").all();
}

function createFriend(db, { name, image }) {
  const id = randomUUID();
  const friend = { id, name, image: normalizeAvatarUrl(image, id), balance: 0 };
  db.prepare("INSERT INTO friends (id, name, image, balance) VALUES (?, ?, ?, ?)")
    .run(friend.id, friend.name, friend.image, friend.balance);
  return friend;
}

function migrateUnseededPravatarUrls(db) {
  const friends = db.prepare("SELECT id, image FROM friends").all();
  const update = db.prepare("UPDATE friends SET image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  for (const friend of friends) {
    const stableImage = normalizeAvatarUrl(friend.image, friend.id);
    if (stableImage !== friend.image) update.run(stableImage, friend.id);
  }
}

function normalizeAvatarUrl(image, friendId) {
  const url = new URL(image);
  if (url.hostname === "i.pravatar.cc" && url.pathname === "/48" && !url.searchParams.has("u")) {
    url.searchParams.set("u", friendId);
    return url.toString();
  }
  return image;
}

function recordSplit(db, friendId, { bill, paidByUser, payer }) {
  const paidByFriend = roundMoney(bill - paidByUser);
  const balanceDelta = payer === "user" ? paidByFriend : -paidByUser;

  db.exec("BEGIN");
  try {
    const result = db.prepare(
      "UPDATE friends SET balance = ROUND(balance + ?, 2), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(balanceDelta, friendId);
    if (result.changes === 0) {
      const error = new Error("Friend not found");
      error.code = "NOT_FOUND";
      throw error;
    }
    db.prepare(`
      INSERT INTO splits (id, friend_id, bill, paid_by_user, paid_by_friend, payer, balance_delta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), friendId, bill, paidByUser, paidByFriend, payer, balanceDelta);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return db.prepare("SELECT id, name, image, balance FROM friends WHERE id = ?").get(friendId);
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = { createDatabase, listFriends, createFriend, recordSplit };
