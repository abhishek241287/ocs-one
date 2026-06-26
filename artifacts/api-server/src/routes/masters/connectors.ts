import { 
  GetConnectorMasterResponse, 
  CreateConnectorMasterBody, 
  UpdateConnectorMasterBody 
} from "@workspace/api-zod";
import { masterConnectorsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterConnectorsTable,
  schema: GetConnectorMasterResponse,
  inputSchema: CreateConnectorMasterBody,
  updateSchema: UpdateConnectorMasterBody,
  resourceName: "Connector Master",
});

export default router;
