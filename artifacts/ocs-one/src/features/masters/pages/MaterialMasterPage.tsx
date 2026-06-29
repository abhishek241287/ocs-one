import { useMemo } from "react";
import {
  useListMaterialMasters,
  useCreateMaterialMaster,
  useUpdateMaterialMaster,
  useToggleMaterialMasterStatus,
  useListMaterialCategories,
  useListCellMasters,
  getListMaterialMastersQueryKey,
} from "@workspace/api-client-react";
import { MaterialMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig } from "../types/master.types";
import { ColumnDef } from "@tanstack/react-table";

const UOM_OPTIONS = [
  { label: "Pieces (PCS)", value: "PCS" },
  { label: "Kilograms (KG)", value: "KG" },
  { label: "Metres (M)", value: "M" },
  { label: "Litres (L)", value: "L" },
  { label: "Set (SET)", value: "SET" },
  { label: "Roll (ROLL)", value: "ROLL" },
];

export default function MaterialMasterPage() {
  // Active categories drive both the create/edit select and the id→name display.
  const categoriesQuery = useListMaterialCategories();

  // Cell masters drive the optional bridge — a material can map to a cell master
  // so its chemistry / capacity / voltage / model auto-flow into a transfer.
  const cellMastersQuery = useListCellMasters({ pageSize: 500 } as any);

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data?.items ?? [])
        .filter((c: any) => c.status === "active")
        .map((c: any) => ({ label: c.name as string, value: c.id as string })),
    [categoriesQuery.data]
  );

  const cellMasterOptions = useMemo(
    () =>
      (cellMastersQuery.data?.items ?? [])
        .filter((c: any) => c.status === "active")
        .map((c: any) => ({ label: `${c.name} (${c.code})` as string, value: c.id as string })),
    [cellMastersQuery.data]
  );

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data?.items ?? []) {
      map.set((c as any).id, (c as any).name);
    }
    return map;
  }, [categoriesQuery.data]);

  const config: MasterConfig<MaterialMaster> = useMemo(() => {
    const columns: ColumnDef<MaterialMaster>[] = [
      { accessorKey: "code", header: "Code" },
      { accessorKey: "name", header: "Name" },
      {
        id: "category",
        header: "Category",
        accessorFn: (row: any) =>
          categoryNameById.get(row.category_id) ?? row.category_id ?? "—",
      },
      { accessorKey: "uom", header: "UOM" },
      {
        id: "manufacturer",
        header: "Manufacturer",
        accessorFn: (row: any) => row.manufacturer || "—",
      },
    ];

    const fields = [
      { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. MAT-CELL-280" },
      { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. LiFePO4 280Ah Cell" },
      {
        name: "category_id",
        label: "Category",
        type: "select",
        required: true,
        placeholder: "Select a category",
        options: categoryOptions,
      },
      { name: "uom", label: "Unit of Measure", type: "select", required: true, placeholder: "Select a UOM", options: UOM_OPTIONS },
      { name: "manufacturer", label: "Manufacturer", type: "text", placeholder: "Optional — e.g. EVE Energy" },
      {
        name: "cell_master_id",
        label: "Cell Master (for cells)",
        type: "select",
        placeholder: "Map to a cell master — required to transfer into Cell Processing",
        options: cellMasterOptions,
      },
    ];

    return {
      resource: "materials",
      title: "Material Master",
      description: "Inventory materials — the canonical list every GRN line references",
      icon: "📦",
      certification: "certified",
      columns,
      fields: fields as any,
    };
  }, [categoryOptions, categoryNameById, cellMasterOptions]);

  return (
    <MasterPage
      config={config}
      hooks={{
        useList: useListMaterialMasters,
        useCreate: useCreateMaterialMaster,
        useUpdate: useUpdateMaterialMaster,
        useToggleStatus: useToggleMaterialMasterStatus,
        listQueryKey: getListMaterialMastersQueryKey(),
      }}
    />
  );
}
