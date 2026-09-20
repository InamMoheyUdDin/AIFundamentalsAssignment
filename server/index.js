const path = require("node:path");
const express = require("express");
const { createApp } = require("./app");

const port = process.env.PORT || 4000;
const app = createApp({ databasePath: path.join(__dirname, "..", "data", "eat-n-split.sqlite") });
const buildDirectory = path.join(__dirname, "..", "build");

app.use(express.static(buildDirectory));
app.get("/{*splat}", (_request, response) => response.sendFile(path.join(buildDirectory, "index.html")));

const server = app.listen(port, () => {
  console.log(`Eat-N-Split API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    app.closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
