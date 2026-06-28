import { Router, type IRouter } from "express";
import { requireRole } from "../../middleware/auth";
import { gatherConfig, validateConfig } from "../../lib/config-integrity";

const router: IRouter = Router();

// ─── GET /api/developer/configuration — config integrity dashboard (director) ──
// Returns the live configuration SNAPSHOT plus the SS-04 integrity VALIDATION,
// both produced by the shared single source of truth (lib/config-integrity.ts)
// that the SS-04 cert suite uses — so what is displayed is provably what is
// verified. Never exposes secret values, only whether a secret is configured.
router.get("/", requireRole("director"), async (_req, res) => {
  const snapshot = await gatherConfig();
  const validation = validateConfig(snapshot);
  res.json({ generatedAt: snapshot.generatedAt, snapshot, validation });
});

export default router;
