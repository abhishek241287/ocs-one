import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./lib/seed";
import { backfillProducts } from "./lib/product-backfill";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function listen(): void {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

// Seed DB (create sequences, admin user), backfill Products for already-passed
// orders (idempotent), then start listening. Production must not serve a
// partially bootstrapped database; development keeps its previous behavior.
seedDatabase()
  .then(() => backfillProducts())
  .then(listen)
  .catch((err) => {
    logger.error({ err }, "Seed/backfill failed");
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    listen();
  });
