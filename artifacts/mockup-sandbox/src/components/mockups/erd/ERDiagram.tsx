// OCS One — Manufacturing Database ERD
// SVG-based Entity Relationship Diagram. No business logic, no API calls.

const DOMAIN_COLORS: Record<string, { bg: string; border: string; header: string; text: string; fk: string }> = {
  system:       { bg: "#0f172a", border: "#334155", header: "#1e293b", text: "#94a3b8", fk: "#64748b" },
  manufacturing:{ bg: "#0c1a30", border: "#1d4ed8", header: "#1e3a8a", text: "#93c5fd", fk: "#3b82f6" },
  cells:        { bg: "#052e16", border: "#15803d", header: "#14532d", text: "#86efac", fk: "#22c55e" },
  central:      { bg: "#2e1065", border: "#7c3aed", header: "#4c1d95", text: "#c4b5fd", fk: "#a78bfa" },
  qc:           { bg: "#1c1400", border: "#d97706", header: "#78350f", text: "#fcd34d", fk: "#f59e0b" },
  inventory:    { bg: "#082f49", border: "#0284c7", header: "#0c4a6e", text: "#7dd3fc", fk: "#0ea5e9" },
  dispatch:     { bg: "#1c0a00", border: "#ea580c", header: "#7c2d12", text: "#fdba74", fk: "#f97316" },
  service:      { bg: "#1c0505", border: "#dc2626", header: "#7f1d1d", text: "#fca5a5", fk: "#ef4444" },
  audit:        { bg: "#1a1700", border: "#ca8a04", header: "#713f12", text: "#fde68a", fk: "#eab308" },
};

interface Column { name: string; type: string; note?: string }
interface Entity {
  id: string; label: string; domain: string;
  x: number; y: number; w: number; h: number;
  pk: string; columns: Column[];
}
interface Rel { from: string; to: string; fromSide: "R"|"L"|"T"|"B"; toSide: "R"|"L"|"T"|"B"; label?: string }

const ENTITIES: Entity[] = [
  // ── SYSTEM ──────────────────────────────────────────────────────────────
  { id:"facilities", label:"facilities", domain:"system", x:310, y:40, w:220, h:130,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"name",type:"VARCHAR"},
      {name:"city",type:"VARCHAR"},
      {name:"state",type:"VARCHAR"},
      {name:"is_active",type:"BOOLEAN"},
    ]},
  { id:"users", label:"users", domain:"system", x:570, y:40, w:220, h:160,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"employee_id",type:"VARCHAR",note:"UNIQUE"},
      {name:"name",type:"VARCHAR"},
      {name:"email",type:"VARCHAR",note:"UNIQUE"},
      {name:"role",type:"ENUM"},
      {name:"facility_id",type:"UUID",note:"FK→facilities"},
    ]},
  { id:"products", label:"products", domain:"system", x:880, y:40, w:230, h:160,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"sku",type:"VARCHAR",note:"UNIQUE"},
      {name:"name",type:"VARCHAR"},
      {name:"category",type:"ENUM"},
      {name:"voltage_v",type:"DECIMAL"},
      {name:"cell_count",type:"INT"},
    ]},
  { id:"bms_units", label:"bms_units", domain:"manufacturing", x:1150, y:40, w:230, h:140,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"serial_number",type:"VARCHAR",note:"UNIQUE"},
      {name:"model",type:"VARCHAR"},
      {name:"firmware_version",type:"VARCHAR"},
      {name:"status",type:"ENUM"},
    ]},

  // ── CELL SUPPLY CHAIN ───────────────────────────────────────────────────
  { id:"cell_lots", label:"cell_lots", domain:"cells", x:30, y:240, w:220, h:140,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"lot_number",type:"VARCHAR",note:"UNIQUE"},
      {name:"supplier_name",type:"VARCHAR"},
      {name:"cell_model",type:"VARCHAR"},
      {name:"quantity_received",type:"INT"},
      {name:"received_by",type:"UUID",note:"FK→users"},
    ]},
  { id:"cells", label:"cells", domain:"cells", x:30, y:430, w:220, h:110,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"cell_lot_id",type:"UUID",note:"FK→cell_lots"},
      {name:"serial_number",type:"VARCHAR",note:"UNIQUE"},
      {name:"status",type:"ENUM"},
    ]},
  { id:"cell_grading_sessions", label:"cell_grading_sessions", domain:"cells", x:30, y:590, w:220, h:130,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"lot_id",type:"UUID",note:"FK→cell_lots"},
      {name:"graded_by",type:"UUID",note:"FK→users"},
      {name:"machine_id",type:"VARCHAR"},
      {name:"started_at",type:"TIMESTAMP"},
    ]},
  { id:"cell_grades", label:"cell_grades", domain:"cells", x:30, y:770, w:220, h:160,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"session_id",type:"UUID",note:"FK→cell_grading_sessions"},
      {name:"cell_id",type:"UUID",note:"FK→cells"},
      {name:"grade",type:"ENUM (A/B/C/reject)"},
      {name:"voltage_mv",type:"DECIMAL"},
      {name:"capacity_mah",type:"DECIMAL"},
      {name:"passed",type:"BOOLEAN"},
    ]},

  // ── PRODUCTION ──────────────────────────────────────────────────────────
  { id:"production_lines", label:"production_lines", domain:"manufacturing", x:310, y:240, w:220, h:120,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"facility_id",type:"UUID",note:"FK→facilities"},
      {name:"name",type:"VARCHAR"},
      {name:"line_number",type:"VARCHAR"},
      {name:"is_active",type:"BOOLEAN"},
    ]},
  { id:"production_orders", label:"production_orders", domain:"manufacturing", x:310, y:410, w:230, h:180,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"order_number",type:"VARCHAR",note:"UNIQUE"},
      {name:"product_id",type:"UUID",note:"FK→products"},
      {name:"production_line_id",type:"UUID",note:"FK→production_lines"},
      {name:"planned_quantity",type:"INT"},
      {name:"produced_quantity",type:"INT"},
      {name:"status",type:"ENUM"},
      {name:"created_by",type:"UUID",note:"FK→users"},
    ]},
  { id:"assemblies", label:"assemblies", domain:"manufacturing", x:310, y:640, w:230, h:150,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"production_order_id",type:"UUID",note:"FK→production_orders"},
      {name:"production_line_id",type:"UUID",note:"FK→production_lines"},
      {name:"operator_id",type:"UUID",note:"FK→users"},
      {name:"status",type:"ENUM"},
      {name:"started_at",type:"TIMESTAMP"},
    ]},
  { id:"cell_battery_map", label:"cell_battery_map", domain:"cells", x:570, y:590, w:220, h:120,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"battery_id",type:"UUID",note:"FK→batteries"},
      {name:"cell_id",type:"UUID",note:"FK→cells"},
      {name:"slot_position",type:"VARCHAR"},
      {name:"installed_at",type:"TIMESTAMP"},
    ]},

  // ── CENTRAL: batteries ──────────────────────────────────────────────────
  { id:"batteries", label:"batteries ★", domain:"central", x:840, y:250, w:260, h:290,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"battery_number",type:"VARCHAR",note:"UNIQUE, IMMUTABLE"},
      {name:"qr_code",type:"VARCHAR",note:"UNIQUE"},
      {name:"product_id",type:"UUID",note:"FK→products"},
      {name:"production_order_id",type:"UUID",note:"FK→production_orders"},
      {name:"assembly_id",type:"UUID",note:"FK→assemblies"},
      {name:"bms_unit_id",type:"UUID",note:"FK→bms_units"},
      {name:"status",type:"ENUM"},
      {name:"manufactured_at",type:"TIMESTAMP"},
      {name:"manufactured_by",type:"UUID",note:"FK→users"},
      {name:"— NO DELETE —",type:"(app + trigger enforced)"},
    ]},

  // ── QC ──────────────────────────────────────────────────────────────────
  { id:"qc_inspections", label:"qc_inspections", domain:"qc", x:1150, y:260, w:230, h:160,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"battery_id",type:"UUID",note:"FK→batteries"},
      {name:"inspector_id",type:"UUID",note:"FK→users"},
      {name:"checkpoint_version",type:"VARCHAR"},
      {name:"result",type:"ENUM"},
      {name:"inspected_at",type:"TIMESTAMP"},
    ]},
  { id:"qc_defects", label:"qc_defects", domain:"qc", x:1150, y:470, w:230, h:130,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"inspection_id",type:"UUID",note:"FK→qc_inspections"},
      {name:"defect_code",type:"VARCHAR"},
      {name:"severity",type:"ENUM"},
      {name:"resolved",type:"BOOLEAN"},
    ]},

  // ── DISPATCH ────────────────────────────────────────────────────────────
  { id:"dispatch_orders", label:"dispatch_orders", domain:"dispatch", x:840, y:620, w:240, h:180,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"order_number",type:"VARCHAR",note:"UNIQUE"},
      {name:"customer_name",type:"VARCHAR"},
      {name:"customer_gstin",type:"VARCHAR"},
      {name:"carrier",type:"VARCHAR"},
      {name:"tracking_number",type:"VARCHAR"},
      {name:"status",type:"ENUM"},
      {name:"dispatched_by",type:"UUID",note:"FK→users"},
    ]},
  { id:"dispatch_items", label:"dispatch_items", domain:"dispatch", x:570, y:770, w:230, h:120,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"dispatch_order_id",type:"UUID",note:"FK→dispatch_orders"},
      {name:"battery_id",type:"UUID",note:"FK→batteries"},
      {name:"inventory_item_id",type:"UUID",note:"FK→inventory_items"},
      {name:"quantity",type:"INT"},
    ]},

  // ── INVENTORY ───────────────────────────────────────────────────────────
  { id:"inventory_items", label:"inventory_items", domain:"inventory", x:310, y:860, w:220, h:140,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"sku",type:"VARCHAR",note:"UNIQUE"},
      {name:"name",type:"VARCHAR"},
      {name:"category",type:"ENUM"},
      {name:"unit",type:"VARCHAR"},
      {name:"reorder_level",type:"DECIMAL"},
    ]},
  { id:"inventory_stock", label:"inventory_stock", domain:"inventory", x:30, y:990, w:220, h:110,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"item_id",type:"UUID",note:"FK→inventory_items"},
      {name:"facility_id",type:"UUID",note:"FK→facilities"},
      {name:"current_quantity",type:"DECIMAL"},
      {name:"reserved_quantity",type:"DECIMAL"},
    ]},
  { id:"stock_movements", label:"stock_movements", domain:"inventory", x:30, y:1160, w:230, h:160,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"item_id",type:"UUID",note:"FK→inventory_items"},
      {name:"facility_id",type:"UUID",note:"FK→facilities"},
      {name:"movement_type",type:"ENUM"},
      {name:"quantity",type:"DECIMAL"},
      {name:"reference_type",type:"VARCHAR"},
      {name:"performed_by",type:"UUID",note:"FK→users"},
    ]},

  // ── AFTER-SALES ─────────────────────────────────────────────────────────
  { id:"warranty_registrations", label:"warranty_registrations", domain:"service", x:1150, y:660, w:230, h:160,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"battery_id",type:"UUID",note:"FK→batteries (UNIQUE)"},
      {name:"dispatch_order_id",type:"UUID",note:"FK→dispatch_orders"},
      {name:"customer_name",type:"VARCHAR"},
      {name:"warranty_start_date",type:"DATE"},
      {name:"warranty_end_date",type:"DATE"},
    ]},
  { id:"service_tickets", label:"service_tickets", domain:"service", x:1150, y:880, w:230, h:190,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"ticket_number",type:"VARCHAR",note:"UNIQUE"},
      {name:"battery_id",type:"UUID",note:"FK→batteries"},
      {name:"warranty_id",type:"UUID",note:"FK→warranty_registrations"},
      {name:"issue_description",type:"TEXT"},
      {name:"status",type:"ENUM"},
      {name:"priority",type:"ENUM"},
      {name:"assigned_to",type:"UUID",note:"FK→users"},
    ]},
  { id:"service_parts_used", label:"service_parts_used", domain:"service", x:1150, y:1130, w:230, h:120,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"ticket_id",type:"UUID",note:"FK→service_tickets"},
      {name:"inventory_item_id",type:"UUID",note:"FK→inventory_items"},
      {name:"quantity",type:"DECIMAL"},
      {name:"used_at",type:"TIMESTAMP"},
    ]},

  // ── AUDIT ───────────────────────────────────────────────────────────────
  { id:"activity_logs", label:"activity_logs", domain:"audit", x:1430, y:500, w:230, h:180,
    pk:"id UUID",
    columns:[
      {name:"id",type:"UUID",note:"PK"},
      {name:"actor_id",type:"UUID",note:"FK→users (nullable)"},
      {name:"actor_name",type:"VARCHAR",note:"denormalized"},
      {name:"action",type:"VARCHAR"},
      {name:"entity_type",type:"VARCHAR"},
      {name:"entity_id",type:"UUID"},
      {name:"changes",type:"JSONB"},
      {name:"performed_at",type:"TIMESTAMP"},
    ]},
];

// Key relationships: [fromId, fromSide, toId, toSide]
const RELS: Rel[] = [
  // System
  { from:"users",               fromSide:"L", to:"facilities",          toSide:"R" },
  { from:"production_lines",    fromSide:"T", to:"facilities",          toSide:"B" },
  // Manufacturing
  { from:"production_orders",   fromSide:"T", to:"production_lines",    toSide:"B" },
  { from:"production_orders",   fromSide:"R", to:"products",            toSide:"B" },
  { from:"assemblies",          fromSide:"T", to:"production_orders",   toSide:"B" },
  // Cells
  { from:"cells",               fromSide:"T", to:"cell_lots",           toSide:"B" },
  { from:"cell_grading_sessions",fromSide:"T",to:"cells",               toSide:"B" },
  { from:"cell_grades",         fromSide:"T", to:"cell_grading_sessions",toSide:"B" },
  { from:"cell_battery_map",    fromSide:"L", to:"cells",               toSide:"R" },
  { from:"cell_battery_map",    fromSide:"R", to:"batteries",           toSide:"L" },
  // Batteries (central)
  { from:"batteries",           fromSide:"T", to:"products",            toSide:"B" },
  { from:"batteries",           fromSide:"L", to:"production_orders",   toSide:"R" },
  { from:"batteries",           fromSide:"L", to:"assemblies",          toSide:"R" },
  { from:"batteries",           fromSide:"T", to:"bms_units",           toSide:"B" },
  // QC
  { from:"qc_inspections",      fromSide:"L", to:"batteries",           toSide:"R" },
  { from:"qc_defects",          fromSide:"T", to:"qc_inspections",      toSide:"B" },
  // Dispatch
  { from:"dispatch_items",      fromSide:"T", to:"batteries",           toSide:"B" },
  { from:"dispatch_items",      fromSide:"R", to:"dispatch_orders",     toSide:"L" },
  // Inventory
  { from:"inventory_stock",     fromSide:"R", to:"inventory_items",     toSide:"L" },
  { from:"stock_movements",     fromSide:"R", to:"inventory_items",     toSide:"L" },
  { from:"dispatch_items",      fromSide:"L", to:"inventory_items",     toSide:"T" },
  // After-sales
  { from:"warranty_registrations",fromSide:"L",to:"batteries",          toSide:"R" },
  { from:"warranty_registrations",fromSide:"T",to:"dispatch_orders",    toSide:"R" },
  { from:"service_tickets",     fromSide:"T", to:"warranty_registrations",toSide:"B" },
  { from:"service_parts_used",  fromSide:"T", to:"service_tickets",     toSide:"B" },
  { from:"service_parts_used",  fromSide:"L", to:"inventory_items",     toSide:"R" },
];

function entityById(id: string) {
  return ENTITIES.find(e => e.id === id)!;
}

function edgePoint(e: Entity, side: "R"|"L"|"T"|"B"): [number, number] {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  switch (side) {
    case "R": return [e.x + e.w, cy];
    case "L": return [e.x, cy];
    case "T": return [cx, e.y];
    case "B": return [cx, e.y + e.h];
  }
}

function RelLine({ rel }: { rel: Rel }) {
  const from = entityById(rel.from);
  const to   = entityById(rel.to);
  const [x1, y1] = edgePoint(from, rel.fromSide);
  const [x2, y2] = edgePoint(to,   rel.toSide);

  const fromColor = DOMAIN_COLORS[from.domain].border;

  // Simple elbow path
  const _mx = (x1 + x2) / 2;
  const _my = (y1 + y2) / 2;

  let d: string;
  if (rel.fromSide === "R" || rel.fromSide === "L") {
    // horizontal elbow
    const offset = rel.fromSide === "R" ? 30 : -30;
    d = `M${x1},${y1} C${x1+offset*2},${y1} ${x2-offset*2},${y2} ${x2},${y2}`;
  } else {
    // vertical elbow
    const offset = rel.fromSide === "B" ? 30 : -30;
    d = `M${x1},${y1} C${x1},${y1+offset*2} ${x2},${y2-offset*2} ${x2},${y2}`;
  }

  return (
    <g>
      <path d={d} fill="none" stroke={fromColor} strokeWidth={1.5} strokeOpacity={0.6} strokeDasharray="4 2" />
      {/* Arrowhead at destination */}
      <circle cx={x2} cy={y2} r={3} fill={fromColor} opacity={0.8} />
    </g>
  );
}

const HEADER_H = 28;
const ROW_H = 18;
const PAD = 8;

function EntityBox({ e }: { e: Entity }) {
  const c = DOMAIN_COLORS[e.domain];
  const isCentral = e.domain === "central";

  return (
    <g>
      {/* Glow for central entity */}
      {isCentral && (
        <rect x={e.x-6} y={e.y-6} width={e.w+12} height={e.h+12}
          rx={10} fill="none" stroke="#7c3aed" strokeWidth={3} strokeOpacity={0.4} />
      )}

      {/* Box background */}
      <rect x={e.x} y={e.y} width={e.w} height={e.h}
        rx={6} fill={c.bg} stroke={c.border} strokeWidth={isCentral ? 2 : 1.5} />

      {/* Header */}
      <rect x={e.x} y={e.y} width={e.w} height={HEADER_H}
        rx={6} fill={c.header} />
      <rect x={e.x} y={e.y+HEADER_H-6} width={e.w} height={8} fill={c.header} />

      {/* Table name */}
      <text x={e.x + PAD} y={e.y + 19}
        fill={c.text} fontSize={isCentral ? 12 : 11} fontWeight="700" fontFamily="monospace">
        {e.label}
      </text>

      {/* Divider */}
      <line x1={e.x+1} y1={e.y+HEADER_H} x2={e.x+e.w-1} y2={e.y+HEADER_H}
        stroke={c.border} strokeWidth={1} />

      {/* Columns */}
      {e.columns.map((col, i) => {
        const cy = e.y + HEADER_H + PAD + i * ROW_H + 13;
        const isFk = col.note?.startsWith("FK");
        const isPk = col.note === "PK";
        const isSpecial = col.name.startsWith("—");
        return (
          <g key={col.name}>
            <text x={e.x + PAD} y={cy}
              fill={isSpecial ? c.fk : isPk ? "#f8fafc" : isFk ? c.fk : c.text}
              fontSize={isSpecial ? 8.5 : 9.5}
              fontFamily="monospace"
              fontStyle={isSpecial ? "italic" : "normal"}
              fontWeight={isPk ? "700" : "400"}>
              {isPk ? "🔑 " : isFk ? "↗ " : "  "}{col.name}
            </text>
            {col.note && !isSpecial && (
              <text x={e.x + e.w - PAD} y={cy}
                fill={isPk ? "#fbbf24" : c.fk}
                fontSize={8} fontFamily="monospace" textAnchor="end" opacity={0.85}>
                {col.note}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

const SVG_W = 1720;
const SVG_H = 1400;

// Domain legend items
const LEGEND = [
  { domain:"system",       label:"System / Users" },
  { domain:"manufacturing",label:"Manufacturing" },
  { domain:"cells",        label:"Cell Supply Chain" },
  { domain:"central",      label:"Batteries (Central Entity)" },
  { domain:"qc",           label:"Quality Control" },
  { domain:"inventory",    label:"Inventory" },
  { domain:"dispatch",     label:"Dispatch" },
  { domain:"service",      label:"After-Sales / Service" },
  { domain:"audit",        label:"Audit Logs" },
];

export function ERDiagram() {
  return (
    <div style={{ background:"#030712", minHeight:"100vh", padding:"0" }}>
      {/* Header */}
      <div style={{ background:"#0f172a", borderBottom:"1px solid #1e293b", padding:"16px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ color:"#a78bfa", fontFamily:"monospace", fontSize:11, letterSpacing:2, marginBottom:4 }}>
            OCS ONE — DATABASE ARCHITECTURE
          </div>
          <div style={{ color:"#f1f5f9", fontFamily:"monospace", fontSize:16, fontWeight:700 }}>
            Manufacturing ERP · Entity Relationship Diagram
          </div>
          <div style={{ color:"#64748b", fontFamily:"monospace", fontSize:10, marginTop:4 }}>
            24 tables · PostgreSQL · All foreign keys shown · No battery deletion policy enforced
          </div>
        </div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", maxWidth:480 }}>
          {LEGEND.map(l => (
            <div key={l.domain} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:DOMAIN_COLORS[l.domain].border }} />
              <span style={{ color:"#94a3b8", fontFamily:"monospace", fontSize:9 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Diagram */}
      <div style={{ overflowX:"auto", overflowY:"auto" }}>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width={SVG_W} height={SVG_H}
          style={{ display:"block" }}>

          {/* Background grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" opacity="0.5"/>
            </pattern>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#475569" />
            </marker>
          </defs>
          <rect width={SVG_W} height={SVG_H} fill="#030712" />
          <rect width={SVG_W} height={SVG_H} fill="url(#grid)" />

          {/* Domain group labels */}
          <text x={30} y={225} fill="#15803d" fontFamily="monospace" fontSize={9} opacity={0.6} letterSpacing={1}>CELL SUPPLY CHAIN</text>
          <text x={310} y={225} fill="#1d4ed8" fontFamily="monospace" fontSize={9} opacity={0.6} letterSpacing={1}>PRODUCTION</text>
          <text x={840} y={235} fill="#7c3aed" fontFamily="monospace" fontSize={9} opacity={0.6} letterSpacing={1}>★ CENTRAL ENTITY</text>
          <text x={1150} y={245} fill="#d97706" fontFamily="monospace" fontSize={9} opacity={0.6} letterSpacing={1}>QUALITY CONTROL</text>
          <text x={840} y={605} fill="#ea580c" fontFamily="monospace" fontSize={9} opacity={0.6} letterSpacing={1}>DISPATCH</text>
          <text x={310} y={845} fill="#0284c7" fontFamily="monospace" fontSize={9} opacity={0.6} letterSpacing={1}>INVENTORY</text>
          <text x={1150} y={645} fill="#dc2626" fontFamily="monospace" fontSize={9} opacity={0.6} letterSpacing={1}>AFTER-SALES & SERVICE</text>
          <text x={1430} y={485} fill="#ca8a04" fontFamily="monospace" fontSize={9} opacity={0.6} letterSpacing={1}>AUDIT</text>

          {/* Relationship lines (drawn first, under boxes) */}
          {RELS.map((rel, i) => <RelLine key={i} rel={rel} />)}

          {/* Entity boxes */}
          {ENTITIES.map(e => <EntityBox key={e.id} e={e} />)}

          {/* Footer note */}
          <text x={SVG_W/2} y={SVG_H-10} textAnchor="middle"
            fill="#334155" fontSize={9} fontFamily="monospace">
            All tables include created_at / updated_at timestamps. No hard deletes — batteries use status enum + soft-delete policy.
          </text>
        </svg>
      </div>
    </div>
  );
}

export default ERDiagram;
