import { 
  GetTestEquipmentMasterResponse, 
  CreateTestEquipmentMasterBody, 
  UpdateTestEquipmentMasterBody 
} from "@workspace/api-zod";
import { masterTestEquipmentTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterTestEquipmentTable,
  schema: GetTestEquipmentMasterResponse,
  inputSchema: CreateTestEquipmentMasterBody,
  updateSchema: UpdateTestEquipmentMasterBody,
  resourceName: "Test Equipment Master",
});

export default router;
