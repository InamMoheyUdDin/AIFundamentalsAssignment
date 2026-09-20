const express = require("express");
const { createDatabase, listFriends, createFriend, recordSplit } = require("./database");

function createApp({ databasePath = "data/eat-n-split.sqlite" } = {}) {
  const db = createDatabase(databasePath);
  const app = express();

  app.use(express.json({ limit: "16kb" }));

  app.get("/api/friends", (_request, response) => {
    response.json(listFriends(db));
  });

  app.post("/api/friends", (request, response, next) => {
    try {
      const friend = validateFriend(request.body);
      response.status(201).json(createFriend(db, friend));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/friends/:id/splits", (request, response, next) => {
    try {
      const split = validateSplit(request.body);
      response.json(recordSplit(db, request.params.id, split));
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (request, _response, next) => {
    const error = new ApiError(404, `No API route matches ${request.method} ${request.path}.`);
    next(error);
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "Request body must be valid JSON." });
    }
    if (error.code === "NOT_FOUND") return response.status(404).json({ error: error.message });
    if (error instanceof ApiError) return response.status(error.status).json({ error: error.message });
    console.error(error);
    return response.status(500).json({ error: "An unexpected server error occurred." });
  });

  app.closeDatabase = () => db.close();
  return app;
}

function validateFriend(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) throw new ApiError(400, "Friend name is required.");
  if (name.length > 80) throw new ApiError(400, "Friend name must be 80 characters or fewer.");

  const image = typeof body?.image === "string" ? body.image.trim() : "";
  if (!image) throw new ApiError(400, "Image URL is required.");
  if (image.length > 2048) throw new ApiError(400, "Image URL is too long.");
  try {
    const url = new URL(image);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    throw new ApiError(400, "Image URL must use HTTP or HTTPS.");
  }
  return { name, image };
}

function validateSplit(body) {
  const bill = body?.bill;
  const paidByUser = body?.paidByUser;
  const payer = body?.payer;
  if (!Number.isFinite(bill) || bill <= 0 || bill > 1000000) {
    throw new ApiError(400, "Bill must be a positive amount up to 1,000,000.");
  }
  if (!Number.isFinite(paidByUser) || paidByUser < 0 || paidByUser > bill) {
    throw new ApiError(400, "Your expense must be between zero and the bill amount.");
  }
  if (!hasAtMostTwoDecimals(bill) || !hasAtMostTwoDecimals(paidByUser)) {
    throw new ApiError(400, "Amounts must use no more than two decimal places.");
  }
  if (payer !== "user" && payer !== "friend") throw new ApiError(400, "Payer must be either user or friend.");
  return { bill: roundMoney(bill), paidByUser: roundMoney(paidByUser), payer };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hasAtMostTwoDecimals(value) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { createApp };
