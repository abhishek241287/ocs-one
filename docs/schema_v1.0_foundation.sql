--
-- PostgreSQL database dump
--

\restrict k1PqkntXTfCi6TcaWCsus0BfP18b08VeJSQRAU9jThm2gzm9EqBkPYiELTKvclO

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: cell_grade; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cell_grade AS ENUM (
    'A',
    'B',
    'C',
    'reject'
);


--
-- Name: cell_match_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cell_match_status AS ENUM (
    'draft',
    'reserved',
    'allocated',
    'cancelled'
);


--
-- Name: cell_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cell_status AS ENUM (
    'received',
    'grading',
    'approved',
    'rejected',
    'quarantine',
    'reserved',
    'allocated'
);


--
-- Name: logistics_dealer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.logistics_dealer_status AS ENUM (
    'active',
    'inactive'
);


--
-- Name: logistics_dispatch_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.logistics_dispatch_status AS ENUM (
    'draft',
    'confirmed',
    'loaded',
    'in_transit',
    'delivered',
    'cancelled'
);


--
-- Name: logistics_shipment_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.logistics_shipment_event_type AS ENUM (
    'ready_for_dispatch',
    'loaded',
    'in_transit',
    'delivered',
    'received_by_dealer'
);


--
-- Name: master_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.master_status AS ENUM (
    'active',
    'inactive'
);


--
-- Name: mfg_charger_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_charger_status AS ENUM (
    'available',
    'busy',
    'maintenance'
);


--
-- Name: mfg_order_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_order_priority AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: mfg_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_order_status AS ENUM (
    'draft',
    'released',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: mfg_qc_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_qc_decision AS ENUM (
    'approved',
    'rejected'
);


--
-- Name: mfg_rework_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_rework_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);


--
-- Name: mfg_stage_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_stage_status AS ENUM (
    'pending',
    'in_progress',
    'paused',
    'completed',
    'approved',
    'rejected'
);


--
-- Name: mfg_stage_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_stage_type AS ENUM (
    'cell_allocation',
    'assembly',
    'compression',
    'bms_allocation',
    'bms_programming',
    'charging',
    'testing',
    'quality_control',
    'packing'
);


--
-- Name: mfg_test_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_test_result AS ENUM (
    'pass',
    'fail',
    'warning'
);


--
-- Name: mfg_test_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mfg_test_type AS ENUM (
    'capacity',
    'charge_discharge',
    'protection',
    'internal_resistance'
);


--
-- Name: test_equipment_floor_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.test_equipment_floor_status AS ENUM (
    'available',
    'busy',
    'maintenance'
);


--
-- Name: test_equipment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.test_equipment_type AS ENUM (
    'capacity_tester',
    'dc_load',
    'protection_tester',
    'internal_resistance_meter',
    'thermal_camera',
    'other'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'director',
    'supervisor',
    'operator',
    'viewer'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cell_grade_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cell_grade_config (
    id integer DEFAULT 1 NOT NULL,
    grade_a_min_capacity_pct double precision DEFAULT 98 NOT NULL,
    grade_a_max_ir_mult double precision DEFAULT 1.05 NOT NULL,
    grade_b_min_capacity_pct double precision DEFAULT 95 NOT NULL,
    grade_b_max_ir_mult double precision DEFAULT 1.1 NOT NULL,
    grade_c_min_capacity_pct double precision DEFAULT 90 NOT NULL,
    grade_c_max_ir_mult double precision DEFAULT 1.15 NOT NULL,
    max_capacity_diff_ah double precision DEFAULT 0.5 NOT NULL,
    max_ir_diff_mohm double precision DEFAULT 2 NOT NULL,
    max_voltage_diff_mv double precision DEFAULT 5 NOT NULL,
    nominal_ir_mohm double precision DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cell_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cell_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier text NOT NULL,
    manufacturer text NOT NULL,
    cell_model text NOT NULL,
    cell_chemistry text DEFAULT 'LiFePO4'::text NOT NULL,
    nominal_capacity_ah double precision NOT NULL,
    lot_number character varying(100) NOT NULL,
    invoice_number character varying(100),
    date_received text NOT NULL,
    quantity_received integer NOT NULL,
    received_by text NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cell_match_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cell_match_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    cell_id uuid NOT NULL,
    battery_slot integer NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cell_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cell_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    battery_model text NOT NULL,
    cells_per_battery integer DEFAULT 16 NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    status public.cell_match_status DEFAULT 'draft'::public.cell_match_status NOT NULL,
    match_score double precision,
    created_by text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cell_id character varying(30) NOT NULL,
    lot_id uuid NOT NULL,
    status public.cell_status DEFAULT 'received'::public.cell_status NOT NULL,
    grade public.cell_grade,
    voltage_v double precision,
    capacity_ah double precision,
    internal_resistance_mohm double precision,
    temperature_c double precision,
    grading_machine_id text,
    graded_by text,
    graded_at timestamp with time zone,
    grading_notes text,
    match_id uuid,
    allocation_order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: logistics_dealers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_dealers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_code character varying(50) NOT NULL,
    dealer_name character varying(255) NOT NULL,
    gst_number character varying(20),
    address text,
    contact_person character varying(255),
    mobile character varying(20),
    email character varying(255),
    territory character varying(255),
    credit_limit numeric(14,2) DEFAULT '0'::numeric,
    status public.logistics_dealer_status DEFAULT 'active'::public.logistics_dealer_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: logistics_dispatch_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_dispatch_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispatch_order_id uuid NOT NULL,
    production_order_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: logistics_dispatch_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_dispatch_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispatch_number character varying(50) NOT NULL,
    dealer_id uuid,
    customer_name character varying(255),
    transporter character varying(255),
    vehicle_number character varying(50),
    driver_name character varying(255),
    driver_mobile character varying(20),
    dispatch_date date,
    status public.logistics_dispatch_status DEFAULT 'draft'::public.logistics_dispatch_status NOT NULL,
    notes text,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: logistics_shipment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_shipment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispatch_order_id uuid NOT NULL,
    event_type public.logistics_shipment_event_type NOT NULL,
    actor character varying(255),
    notes text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: master_bms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_bms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manufacturer text NOT NULL,
    model text NOT NULL,
    current_rating_a numeric NOT NULL,
    min_voltage_v numeric NOT NULL,
    max_voltage_v numeric NOT NULL,
    cell_support_count integer NOT NULL,
    has_bluetooth boolean DEFAULT false NOT NULL,
    has_can boolean DEFAULT false NOT NULL,
    has_rs485 boolean DEFAULT false NOT NULL,
    has_uart boolean DEFAULT false NOT NULL,
    firmware_version text,
    datasheet_url text
);


--
-- Name: master_busbars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_busbars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    material text NOT NULL,
    thickness_mm numeric NOT NULL,
    width_mm numeric NOT NULL,
    length_mm numeric NOT NULL,
    surface_finish text NOT NULL
);


--
-- Name: master_cabinets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_cabinets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    model text NOT NULL,
    material text NOT NULL,
    ip_rating text NOT NULL,
    dimensions text NOT NULL,
    weight_kg numeric NOT NULL,
    colour text NOT NULL,
    mounting_type text NOT NULL
);


--
-- Name: master_cables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_cables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    size_sqmm numeric NOT NULL,
    colour text NOT NULL,
    current_rating_a numeric NOT NULL,
    insulation_type text NOT NULL,
    manufacturer text NOT NULL
);


--
-- Name: master_cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_cells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manufacturer text NOT NULL,
    model text NOT NULL,
    chemistry text NOT NULL,
    capacity_mah numeric NOT NULL,
    nominal_voltage_v numeric NOT NULL,
    max_voltage_v numeric NOT NULL,
    min_voltage_v numeric NOT NULL,
    weight_g numeric NOT NULL,
    dimensions text NOT NULL,
    internal_resistance_spec_mohm numeric NOT NULL,
    cycle_life integer NOT NULL,
    datasheet_url text,
    approved_supplier text
);


--
-- Name: master_chargers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_chargers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manufacturer text NOT NULL,
    model text NOT NULL,
    output_voltage_v numeric NOT NULL,
    output_current_a numeric NOT NULL,
    power_kw numeric NOT NULL,
    communication_protocol text NOT NULL,
    datasheet_url text
);


--
-- Name: master_connectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_connectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manufacturer text NOT NULL,
    model text NOT NULL,
    current_rating_a numeric NOT NULL,
    voltage_rating_v numeric NOT NULL,
    connector_type text NOT NULL,
    datasheet_url text
);


--
-- Name: master_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    chemistry text NOT NULL,
    category text NOT NULL,
    nominal_voltage_v numeric NOT NULL,
    capacity_ah numeric NOT NULL,
    energy_kwh numeric NOT NULL,
    configuration text NOT NULL,
    cell_count integer NOT NULL,
    bms_master_id uuid,
    cabinet_master_id uuid,
    cell_master_id uuid,
    warranty_period_months integer NOT NULL,
    product_image_url text
);


--
-- Name: master_test_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_test_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    revision_number integer DEFAULT 1 NOT NULL,
    effective_date date,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    equipment_name text NOT NULL,
    manufacturer text NOT NULL,
    model text NOT NULL,
    serial_number text NOT NULL,
    calibration_date date NOT NULL,
    next_calibration_due date NOT NULL,
    software_version text,
    location text,
    equipment_type public.test_equipment_type DEFAULT 'other'::public.test_equipment_type NOT NULL,
    floor_status public.test_equipment_floor_status DEFAULT 'available'::public.test_equipment_floor_status NOT NULL
);


--
-- Name: mfg_battery_genealogy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_battery_genealogy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_order_id uuid NOT NULL,
    component_type character varying(50) NOT NULL,
    component_id uuid,
    component_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    serial_number text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mfg_battery_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mfg_battery_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mfg_battery_timeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_battery_timeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_order_id uuid NOT NULL,
    event_type text NOT NULL,
    stage_type public.mfg_stage_type,
    actor text NOT NULL,
    description text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mfg_charger_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_charger_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    charger_code character varying(50) NOT NULL,
    model character varying(255) NOT NULL,
    manufacturer character varying(255) NOT NULL,
    serial_number character varying(255) NOT NULL,
    output_voltage_v numeric,
    max_current_a numeric,
    status public.mfg_charger_status DEFAULT 'available'::public.mfg_charger_status NOT NULL,
    current_order_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mfg_formation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_formation_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_order_id uuid NOT NULL,
    charger_unit_id uuid,
    charger_code character varying(50),
    operator text NOT NULL,
    charge_start_at timestamp with time zone,
    charge_end_at timestamp with time zone,
    charge_time_min numeric,
    energy_kwh numeric,
    charging_current_a numeric,
    start_voltage_v numeric,
    final_voltage_v numeric,
    final_current_a numeric,
    ambient_temp_c numeric,
    battery_temp_c numeric,
    top_balancing_required boolean DEFAULT false NOT NULL,
    top_balancing_start_at timestamp with time zone,
    top_balancing_end_at timestamp with time zone,
    final_cell_voltage_spread_mv numeric,
    max_cell_voltage_v numeric,
    min_cell_voltage_v numeric,
    voltage_diff_mv numeric,
    balancing_status character varying(20),
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mfg_order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mfg_order_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mfg_order_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_order_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_order_id uuid NOT NULL,
    stage_type public.mfg_stage_type NOT NULL,
    stage_order integer NOT NULL,
    status public.mfg_stage_status DEFAULT 'pending'::public.mfg_stage_status NOT NULL,
    operator_name text,
    supervisor_name text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    approved_at timestamp with time zone,
    notes text,
    photos jsonb DEFAULT '[]'::jsonb,
    stage_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paused_at timestamp with time zone,
    resumed_at timestamp with time zone
);


--
-- Name: mfg_production_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_production_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number character varying(50) NOT NULL,
    battery_number character varying(50) NOT NULL,
    product_id uuid,
    factory_manager text NOT NULL,
    current_stage public.mfg_stage_type,
    status public.mfg_order_status DEFAULT 'draft'::public.mfg_order_status NOT NULL,
    priority public.mfg_order_priority DEFAULT 'medium'::public.mfg_order_priority NOT NULL,
    planned_start_date date,
    planned_end_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cell_match_id uuid,
    charger_unit_id uuid
);


--
-- Name: mfg_qc_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_qc_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_order_id uuid NOT NULL,
    decision public.mfg_qc_decision NOT NULL,
    inspector_name text NOT NULL,
    inspector_role character varying(100) DEFAULT 'Plant Manager'::character varying NOT NULL,
    digital_signature text,
    remarks text,
    approved_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mfg_rework_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_rework_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_number character varying(50) NOT NULL,
    production_order_id uuid NOT NULL,
    battery_number character varying(50) NOT NULL,
    failed_tests jsonb DEFAULT '[]'::jsonb,
    failure_reason text NOT NULL,
    status public.mfg_rework_status DEFAULT 'open'::public.mfg_rework_status NOT NULL,
    assigned_technician text,
    corrective_action text,
    retest_required boolean DEFAULT true NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mfg_test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfg_test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_order_id uuid NOT NULL,
    test_type public.mfg_test_type NOT NULL,
    test_equipment_id uuid,
    test_equipment_name text,
    operator_name text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    result public.mfg_test_result NOT NULL,
    test_data jsonb DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    role public.user_role DEFAULT 'operator'::public.user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cell_grade_config cell_grade_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_grade_config
    ADD CONSTRAINT cell_grade_config_pkey PRIMARY KEY (id);


--
-- Name: cell_lots cell_lots_lot_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_lots
    ADD CONSTRAINT cell_lots_lot_number_unique UNIQUE (lot_number);


--
-- Name: cell_lots cell_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_lots
    ADD CONSTRAINT cell_lots_pkey PRIMARY KEY (id);


--
-- Name: cell_match_items cell_match_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_match_items
    ADD CONSTRAINT cell_match_items_pkey PRIMARY KEY (id);


--
-- Name: cell_matches cell_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_matches
    ADD CONSTRAINT cell_matches_pkey PRIMARY KEY (id);


--
-- Name: cells cells_cell_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_cell_id_unique UNIQUE (cell_id);


--
-- Name: cells cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_pkey PRIMARY KEY (id);


--
-- Name: logistics_dealers logistics_dealers_dealer_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dealers
    ADD CONSTRAINT logistics_dealers_dealer_code_unique UNIQUE (dealer_code);


--
-- Name: logistics_dealers logistics_dealers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dealers
    ADD CONSTRAINT logistics_dealers_pkey PRIMARY KEY (id);


--
-- Name: logistics_dispatch_items logistics_dispatch_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dispatch_items
    ADD CONSTRAINT logistics_dispatch_items_pkey PRIMARY KEY (id);


--
-- Name: logistics_dispatch_items logistics_dispatch_items_production_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dispatch_items
    ADD CONSTRAINT logistics_dispatch_items_production_order_id_unique UNIQUE (production_order_id);


--
-- Name: logistics_dispatch_orders logistics_dispatch_orders_dispatch_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dispatch_orders
    ADD CONSTRAINT logistics_dispatch_orders_dispatch_number_unique UNIQUE (dispatch_number);


--
-- Name: logistics_dispatch_orders logistics_dispatch_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dispatch_orders
    ADD CONSTRAINT logistics_dispatch_orders_pkey PRIMARY KEY (id);


--
-- Name: logistics_shipment_events logistics_shipment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_shipment_events
    ADD CONSTRAINT logistics_shipment_events_pkey PRIMARY KEY (id);


--
-- Name: master_bms master_bms_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_bms
    ADD CONSTRAINT master_bms_code_unique UNIQUE (code);


--
-- Name: master_bms master_bms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_bms
    ADD CONSTRAINT master_bms_pkey PRIMARY KEY (id);


--
-- Name: master_busbars master_busbars_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_busbars
    ADD CONSTRAINT master_busbars_code_unique UNIQUE (code);


--
-- Name: master_busbars master_busbars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_busbars
    ADD CONSTRAINT master_busbars_pkey PRIMARY KEY (id);


--
-- Name: master_cabinets master_cabinets_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_cabinets
    ADD CONSTRAINT master_cabinets_code_unique UNIQUE (code);


--
-- Name: master_cabinets master_cabinets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_cabinets
    ADD CONSTRAINT master_cabinets_pkey PRIMARY KEY (id);


--
-- Name: master_cables master_cables_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_cables
    ADD CONSTRAINT master_cables_code_unique UNIQUE (code);


--
-- Name: master_cables master_cables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_cables
    ADD CONSTRAINT master_cables_pkey PRIMARY KEY (id);


--
-- Name: master_cells master_cells_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_cells
    ADD CONSTRAINT master_cells_code_unique UNIQUE (code);


--
-- Name: master_cells master_cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_cells
    ADD CONSTRAINT master_cells_pkey PRIMARY KEY (id);


--
-- Name: master_chargers master_chargers_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_chargers
    ADD CONSTRAINT master_chargers_code_unique UNIQUE (code);


--
-- Name: master_chargers master_chargers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_chargers
    ADD CONSTRAINT master_chargers_pkey PRIMARY KEY (id);


--
-- Name: master_connectors master_connectors_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_connectors
    ADD CONSTRAINT master_connectors_code_unique UNIQUE (code);


--
-- Name: master_connectors master_connectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_connectors
    ADD CONSTRAINT master_connectors_pkey PRIMARY KEY (id);


--
-- Name: master_products master_products_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_products
    ADD CONSTRAINT master_products_code_unique UNIQUE (code);


--
-- Name: master_products master_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_products
    ADD CONSTRAINT master_products_pkey PRIMARY KEY (id);


--
-- Name: master_test_equipment master_test_equipment_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_test_equipment
    ADD CONSTRAINT master_test_equipment_code_unique UNIQUE (code);


--
-- Name: master_test_equipment master_test_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_test_equipment
    ADD CONSTRAINT master_test_equipment_pkey PRIMARY KEY (id);


--
-- Name: master_test_equipment master_test_equipment_serial_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_test_equipment
    ADD CONSTRAINT master_test_equipment_serial_number_unique UNIQUE (serial_number);


--
-- Name: mfg_battery_genealogy mfg_battery_genealogy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_battery_genealogy
    ADD CONSTRAINT mfg_battery_genealogy_pkey PRIMARY KEY (id);


--
-- Name: mfg_battery_timeline mfg_battery_timeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_battery_timeline
    ADD CONSTRAINT mfg_battery_timeline_pkey PRIMARY KEY (id);


--
-- Name: mfg_charger_units mfg_charger_units_charger_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_charger_units
    ADD CONSTRAINT mfg_charger_units_charger_code_unique UNIQUE (charger_code);


--
-- Name: mfg_charger_units mfg_charger_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_charger_units
    ADD CONSTRAINT mfg_charger_units_pkey PRIMARY KEY (id);


--
-- Name: mfg_charger_units mfg_charger_units_serial_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_charger_units
    ADD CONSTRAINT mfg_charger_units_serial_number_unique UNIQUE (serial_number);


--
-- Name: mfg_formation_reports mfg_formation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_formation_reports
    ADD CONSTRAINT mfg_formation_reports_pkey PRIMARY KEY (id);


--
-- Name: mfg_order_stages mfg_order_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_order_stages
    ADD CONSTRAINT mfg_order_stages_pkey PRIMARY KEY (id);


--
-- Name: mfg_production_orders mfg_production_orders_battery_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_production_orders
    ADD CONSTRAINT mfg_production_orders_battery_number_unique UNIQUE (battery_number);


--
-- Name: mfg_production_orders mfg_production_orders_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_production_orders
    ADD CONSTRAINT mfg_production_orders_order_number_unique UNIQUE (order_number);


--
-- Name: mfg_production_orders mfg_production_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_production_orders
    ADD CONSTRAINT mfg_production_orders_pkey PRIMARY KEY (id);


--
-- Name: mfg_qc_approvals mfg_qc_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_qc_approvals
    ADD CONSTRAINT mfg_qc_approvals_pkey PRIMARY KEY (id);


--
-- Name: mfg_rework_tickets mfg_rework_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_rework_tickets
    ADD CONSTRAINT mfg_rework_tickets_pkey PRIMARY KEY (id);


--
-- Name: mfg_rework_tickets mfg_rework_tickets_ticket_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_rework_tickets
    ADD CONSTRAINT mfg_rework_tickets_ticket_number_unique UNIQUE (ticket_number);


--
-- Name: mfg_test_results mfg_test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_test_results
    ADD CONSTRAINT mfg_test_results_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_cell_match_items_cell_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cell_match_items_cell_id ON public.cell_match_items USING btree (cell_id);


--
-- Name: idx_cell_match_items_match_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cell_match_items_match_id ON public.cell_match_items USING btree (match_id);


--
-- Name: idx_cell_matches_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cell_matches_created_at ON public.cell_matches USING btree (created_at);


--
-- Name: idx_cell_matches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cell_matches_status ON public.cell_matches USING btree (status);


--
-- Name: idx_cells_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cells_grade ON public.cells USING btree (grade);


--
-- Name: idx_cells_lot_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cells_lot_id ON public.cells USING btree (lot_id);


--
-- Name: idx_cells_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cells_status ON public.cells USING btree (status);


--
-- Name: idx_cells_status_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cells_status_grade ON public.cells USING btree (status, grade);


--
-- Name: idx_dispatch_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatch_items_order_id ON public.logistics_dispatch_items USING btree (dispatch_order_id);


--
-- Name: idx_dispatch_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatch_orders_created_at ON public.logistics_dispatch_orders USING btree (created_at);


--
-- Name: idx_dispatch_orders_dealer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatch_orders_dealer_id ON public.logistics_dispatch_orders USING btree (dealer_id);


--
-- Name: idx_dispatch_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatch_orders_status ON public.logistics_dispatch_orders USING btree (status);


--
-- Name: idx_mfg_formation_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_formation_order_id ON public.mfg_formation_reports USING btree (production_order_id);


--
-- Name: idx_mfg_genealogy_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_genealogy_order_id ON public.mfg_battery_genealogy USING btree (production_order_id);


--
-- Name: idx_mfg_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_orders_created_at ON public.mfg_production_orders USING btree (created_at);


--
-- Name: idx_mfg_orders_current_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_orders_current_stage ON public.mfg_production_orders USING btree (current_stage);


--
-- Name: idx_mfg_orders_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_orders_product_id ON public.mfg_production_orders USING btree (product_id);


--
-- Name: idx_mfg_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_orders_status ON public.mfg_production_orders USING btree (status);


--
-- Name: idx_mfg_orders_status_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_orders_status_stage ON public.mfg_production_orders USING btree (status, current_stage);


--
-- Name: idx_mfg_qc_approvals_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_qc_approvals_order_id ON public.mfg_qc_approvals USING btree (production_order_id);


--
-- Name: idx_mfg_rework_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_rework_order_id ON public.mfg_rework_tickets USING btree (production_order_id);


--
-- Name: idx_mfg_rework_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_rework_status ON public.mfg_rework_tickets USING btree (status);


--
-- Name: idx_mfg_stages_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_stages_order_id ON public.mfg_order_stages USING btree (production_order_id);


--
-- Name: idx_mfg_stages_order_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_stages_order_type ON public.mfg_order_stages USING btree (production_order_id, stage_type);


--
-- Name: idx_mfg_stages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_stages_status ON public.mfg_order_stages USING btree (status);


--
-- Name: idx_mfg_test_results_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_test_results_order_id ON public.mfg_test_results USING btree (production_order_id);


--
-- Name: idx_mfg_timeline_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_timeline_created_at ON public.mfg_battery_timeline USING btree (created_at);


--
-- Name: idx_mfg_timeline_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_timeline_order_id ON public.mfg_battery_timeline USING btree (production_order_id);


--
-- Name: idx_shipment_events_dispatch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipment_events_dispatch_id ON public.logistics_shipment_events USING btree (dispatch_order_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: cell_match_items cell_match_items_cell_id_cells_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_match_items
    ADD CONSTRAINT cell_match_items_cell_id_cells_id_fk FOREIGN KEY (cell_id) REFERENCES public.cells(id);


--
-- Name: cell_match_items cell_match_items_match_id_cell_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_match_items
    ADD CONSTRAINT cell_match_items_match_id_cell_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.cell_matches(id) ON DELETE CASCADE;


--
-- Name: cell_matches cell_matches_product_id_master_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cell_matches
    ADD CONSTRAINT cell_matches_product_id_master_products_id_fk FOREIGN KEY (product_id) REFERENCES public.master_products(id);


--
-- Name: cells cells_lot_id_cell_lots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cells
    ADD CONSTRAINT cells_lot_id_cell_lots_id_fk FOREIGN KEY (lot_id) REFERENCES public.cell_lots(id);


--
-- Name: logistics_dispatch_items logistics_dispatch_items_dispatch_order_id_logistics_dispatch_o; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dispatch_items
    ADD CONSTRAINT logistics_dispatch_items_dispatch_order_id_logistics_dispatch_o FOREIGN KEY (dispatch_order_id) REFERENCES public.logistics_dispatch_orders(id) ON DELETE CASCADE;


--
-- Name: logistics_dispatch_items logistics_dispatch_items_production_order_id_mfg_production_ord; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dispatch_items
    ADD CONSTRAINT logistics_dispatch_items_production_order_id_mfg_production_ord FOREIGN KEY (production_order_id) REFERENCES public.mfg_production_orders(id);


--
-- Name: logistics_dispatch_orders logistics_dispatch_orders_dealer_id_logistics_dealers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_dispatch_orders
    ADD CONSTRAINT logistics_dispatch_orders_dealer_id_logistics_dealers_id_fk FOREIGN KEY (dealer_id) REFERENCES public.logistics_dealers(id);


--
-- Name: logistics_shipment_events logistics_shipment_events_dispatch_order_id_logistics_dispatch_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_shipment_events
    ADD CONSTRAINT logistics_shipment_events_dispatch_order_id_logistics_dispatch_ FOREIGN KEY (dispatch_order_id) REFERENCES public.logistics_dispatch_orders(id) ON DELETE CASCADE;


--
-- Name: master_products master_products_bms_master_id_master_bms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_products
    ADD CONSTRAINT master_products_bms_master_id_master_bms_id_fk FOREIGN KEY (bms_master_id) REFERENCES public.master_bms(id);


--
-- Name: master_products master_products_cabinet_master_id_master_cabinets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_products
    ADD CONSTRAINT master_products_cabinet_master_id_master_cabinets_id_fk FOREIGN KEY (cabinet_master_id) REFERENCES public.master_cabinets(id);


--
-- Name: master_products master_products_cell_master_id_master_cells_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_products
    ADD CONSTRAINT master_products_cell_master_id_master_cells_id_fk FOREIGN KEY (cell_master_id) REFERENCES public.master_cells(id);


--
-- Name: mfg_battery_genealogy mfg_battery_genealogy_production_order_id_mfg_production_orders; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_battery_genealogy
    ADD CONSTRAINT mfg_battery_genealogy_production_order_id_mfg_production_orders FOREIGN KEY (production_order_id) REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE;


--
-- Name: mfg_battery_timeline mfg_battery_timeline_production_order_id_mfg_production_orders_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_battery_timeline
    ADD CONSTRAINT mfg_battery_timeline_production_order_id_mfg_production_orders_ FOREIGN KEY (production_order_id) REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE;


--
-- Name: mfg_formation_reports mfg_formation_reports_charger_unit_id_mfg_charger_units_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_formation_reports
    ADD CONSTRAINT mfg_formation_reports_charger_unit_id_mfg_charger_units_id_fk FOREIGN KEY (charger_unit_id) REFERENCES public.mfg_charger_units(id);


--
-- Name: mfg_formation_reports mfg_formation_reports_production_order_id_mfg_production_orders; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_formation_reports
    ADD CONSTRAINT mfg_formation_reports_production_order_id_mfg_production_orders FOREIGN KEY (production_order_id) REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE;


--
-- Name: mfg_order_stages mfg_order_stages_production_order_id_mfg_production_orders_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_order_stages
    ADD CONSTRAINT mfg_order_stages_production_order_id_mfg_production_orders_id_f FOREIGN KEY (production_order_id) REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE;


--
-- Name: mfg_production_orders mfg_production_orders_cell_match_id_cell_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_production_orders
    ADD CONSTRAINT mfg_production_orders_cell_match_id_cell_matches_id_fk FOREIGN KEY (cell_match_id) REFERENCES public.cell_matches(id);


--
-- Name: mfg_production_orders mfg_production_orders_charger_unit_id_mfg_charger_units_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_production_orders
    ADD CONSTRAINT mfg_production_orders_charger_unit_id_mfg_charger_units_id_fk FOREIGN KEY (charger_unit_id) REFERENCES public.mfg_charger_units(id);


--
-- Name: mfg_production_orders mfg_production_orders_product_id_master_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_production_orders
    ADD CONSTRAINT mfg_production_orders_product_id_master_products_id_fk FOREIGN KEY (product_id) REFERENCES public.master_products(id);


--
-- Name: mfg_qc_approvals mfg_qc_approvals_production_order_id_mfg_production_orders_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_qc_approvals
    ADD CONSTRAINT mfg_qc_approvals_production_order_id_mfg_production_orders_id_f FOREIGN KEY (production_order_id) REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE;


--
-- Name: mfg_rework_tickets mfg_rework_tickets_production_order_id_mfg_production_orders_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_rework_tickets
    ADD CONSTRAINT mfg_rework_tickets_production_order_id_mfg_production_orders_id FOREIGN KEY (production_order_id) REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE;


--
-- Name: mfg_test_results mfg_test_results_production_order_id_mfg_production_orders_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfg_test_results
    ADD CONSTRAINT mfg_test_results_production_order_id_mfg_production_orders_id_f FOREIGN KEY (production_order_id) REFERENCES public.mfg_production_orders(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict k1PqkntXTfCi6TcaWCsus0BfP18b08VeJSQRAU9jThm2gzm9EqBkPYiELTKvclO

