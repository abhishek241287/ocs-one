import { useMemo } from "react";
import {
  useListMaterialMasters,
  useCreateMaterialMaster,
  useUpdateMaterialMaster,
  useToggleMaterialMasterStatus,
  useListMaterialCategories,
  useListCellMasters,
  useListBmsMasters,
  useListCableMasters,
  useListBusbarMasters,
  useListConnectorMasters,
  useListChargerMasters,
  useListCabinetMasters,
  getListMaterialMastersQueryKey,
} from "@workspace/api-client-react";
import { MaterialMaster } from "@workspace/api-client-react";
import { MasterPage } from "../components/MasterPage";
import { MasterConfig, FormState } from "../types/master.types";
import {
  FAMILY_LABELS,
  USAGE_LABELS,
  USAGE_TYPE_OPTIONS,
} from "../constants/linkedMaster";
import { ColumnDef } from "@tanstack/react-table";

const UOM_OPTIONS = [
  { label: "Pieces (PCS)", value: "PCS" },
  { label: "Kilograms (KG)", value: "KG" },
  { label: "Metres (M)", value: "M" },
  { label: "Litres (L)", value: "L" },
  { label: "Set (SET)", value: "SET" },
  { label: "Roll (ROLL)", value: "ROLL" },
];

type Opt = { label: string; value: string };

export default function MaterialMasterPage() {
  // Active categories drive the category select, the id→name display, AND the
  // declared component family that scopes the "Link To" picker.
  const categoriesQuery = useListMaterialCategories();

  // All seven component-master families. Each material in an INVENTORY_COMPONENT
  // category links to exactly one master of its category's declared family.
  const cellQ = useListCellMasters({ pageSize: 500 } as any);
  const bmsQ = useListBmsMasters({ pageSize: 500 } as any);
  const cableQ = useListCableMasters({ pageSize: 500 } as any);
  const busbarQ = useListBusbarMasters({ pageSize: 500 } as any);
  const connectorQ = useListConnectorMasters({ pageSize: 500 } as any);
  const chargerQ = useListChargerMasters({ pageSize: 500 } as any);
  const cabinetQ = useListCabinetMasters({ pageSize: 500 } as any);

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data?.items ?? [])
        .filter((c: any) => c.status === "active")
        .map((c: any) => ({ label: c.name as string, value: c.id as string })),
    [categoriesQuery.data]
  );

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data?.items ?? []) map.set((c as any).id, (c as any).name);
    return map;
  }, [categoriesQuery.data]);

  // category id → declared component family (null for consumable/packaging cats).
  const categoryFamilyById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of categoriesQuery.data?.items ?? [])
      map.set((c as any).id, ((c as any).linked_master_type as string) || null);
    return map;
  }, [categoriesQuery.data]);

  // category id → engineering_master_required flag. This flag ALONE decides whether a
  // material in the category must link a component master (decoupled from Usage Type).
  const categoryEngReqById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of categoriesQuery.data?.items ?? [])
      map.set((c as any).id, Boolean((c as any).engineering_master_required));
    return map;
  }, [categoriesQuery.data]);

  // family → active master options.
  const familyOptions = useMemo(() => {
    const toOpts = (q: any): Opt[] =>
      (q.data?.items ?? [])
        .filter((m: any) => m.status === "active")
        .map((m: any) => ({ label: `${m.name} (${m.code})`, value: m.id as string }));
    return {
      CELL: toOpts(cellQ),
      BMS: toOpts(bmsQ),
      CABLE: toOpts(cableQ),
      BUSBAR: toOpts(busbarQ),
      CONNECTOR: toOpts(connectorQ),
      CHARGER: toOpts(chargerQ),
      CABINET: toOpts(cabinetQ),
    } as Record<string, Opt[]>;
  }, [cellQ.data, bmsQ.data, cableQ.data, busbarQ.data, connectorQ.data, chargerQ.data, cabinetQ.data]);

  const familyOf = (form: FormState): string | null =>
    categoryFamilyById.get(form.category_id as string) ?? null;
  // A linked component master is REQUIRED only when the selected category's
  // engineering_master_required flag is true (sole source of truth).
  const engReqOf = (form: FormState): boolean =>
    categoryEngReqById.get(form.category_id as string) ?? false;

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
      {
        id: "usage",
        header: "Usage",
        accessorFn: (row: any) => USAGE_LABELS[row.usage_type] ?? row.usage_type ?? "—",
      },
      {
        id: "linked_master",
        header: "Linked Master",
        accessorFn: (row: any) =>
          row.linked_master
            ? `${FAMILY_LABELS[row.linked_master.type] ?? row.linked_master.type}: ${row.linked_master.name} (${row.linked_master.code})`
            : "—",
      },
      { accessorKey: "uom", header: "UOM" },
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
      {
        name: "usage_type",
        label: "Usage Type",
        type: "select",
        required: true,
        placeholder: "Select a usage type",
        options: USAGE_TYPE_OPTIONS,
        helpText:
          "Inventory Component links to a component master and stocks. Consumable/Packaging stock without a link. Service Item never stocks.",
      },
      { name: "uom", label: "Unit of Measure", type: "select", required: true, placeholder: "Select a UOM", options: UOM_OPTIONS },
      { name: "manufacturer", label: "Manufacturer", type: "text", placeholder: "Optional — e.g. EVE Energy" },
      {
        name: "linked_master_id",
        label: "Link To Component Master",
        type: "select",
        required: true,
        placeholder: "Select the component master this material represents",
        // Scope to the selected category's declared family.
        optionsFn: (form: FormState) => familyOptions[familyOf(form) ?? ""] ?? [],
        // Shown only when the selected category REQUIRES an engineering master
        // (engineering_master_required = Yes) — the sole driver, independent of Usage
        // Type. When the category declares no family the option list is empty and Save
        // stays disabled with the guidance below — never a silent 422.
        visibleWhen: (form: FormState) => engReqOf(form),
        helpText:
          "This category requires a linked component master. If this list is empty, the category has no component family — set its Link Type on the Material Category master. Linking is immutable once the material is received; to change it, create a new material revision.",
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
      onFieldChange: (name: string, _value: unknown, form: FormState) => {
        // Changing the category (and thus its component family / requirement)
        // invalidates any prior link selection — clear it so the operator re-picks
        // within the new family instead of submitting a stale, cross-family id that
        // the backend would reject.
        if (name === "category_id") return { ...form, linked_master_id: undefined };
        return form;
      },
      transformSubmit: (data: FormState) => {
        const family = familyOf(data);
        const linkId = (data.linked_master_id as string) || null;
        const usage = (data.usage_type as string) || "INVENTORY_COMPONENT";
        const next: FormState = { ...data, usage_type: usage };
        // cell_master_id is derived server-side from a CELL link — never send it.
        delete next.cell_master_id;
        delete next.linked_master; // response-only summary
        // Persist the link whenever the category declares a family AND an id is
        // present — this covers both the REQUIRED case (engineering_master_required,
        // enforced by the visible required field above) and any OPTIONAL link on a
        // non-requiring category, so an existing link is never silently wiped on edit.
        // Only when the category has no family (nothing linkable) do we clear it.
        if (family && linkId) {
          next.linked_master_type = family;
          next.linked_master_id = linkId;
        } else {
          next.linked_master_type = null;
          next.linked_master_id = null;
        }
        return next;
      },
    };
  }, [categoryOptions, categoryNameById, categoryFamilyById, categoryEngReqById, familyOptions]);

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
