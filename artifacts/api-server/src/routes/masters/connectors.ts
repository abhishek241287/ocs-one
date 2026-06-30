import { 
  GetConnectorMasterResponse, 
  CreateConnectorMasterBody, 
  UpdateConnectorMasterBody 
} from "@workspace/api-zod";
import { masterConnectorsTable } from "@workspace/db";
import { createMasterRouter } from "./common";
import { componentMasterIdentityGuard } from "../../lib/linked-master";

const router = createMasterRouter({
  table: masterConnectorsTable,
  schema: GetConnectorMasterResponse,
  inputSchema: CreateConnectorMasterBody,
  updateSchema: UpdateConnectorMasterBody,
  resourceName: "Connector Master",
  // Identity-lock once linked to an active material with transactions.
  beforeWrite: componentMasterIdentityGuard("CONNECTOR", [
    "connectorType",
    "currentRatingA",
    "voltageRatingV",
  ]),
});

export default router;
