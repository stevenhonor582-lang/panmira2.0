--
-- PostgreSQL database dump
--

\restrict l498Jzz9Ul2kZgaH0LMUQa4bdK63PHTzDh5vbvEmEc6LDW10DjaXW5iSI8DAcev

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

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
-- Name: umami; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA umami;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._journal (
    idx integer NOT NULL,
    version text NOT NULL,
    "when" bigint NOT NULL,
    tag text NOT NULL,
    breakpoints boolean DEFAULT true
);


--
-- Name: _journal_idx_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public._journal_idx_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: _journal_idx_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public._journal_idx_seq OWNED BY public._journal.idx;


--
-- Name: activity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_events (
    id uuid NOT NULL,
    type text NOT NULL,
    bot_name text,
    chat_id text,
    user_id text,
    prompt text,
    response_preview text,
    cost_usd double precision,
    duration_ms integer,
    error_message text,
    "timestamp" bigint,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    cache_read_tokens integer DEFAULT 0,
    cache_creation_tokens integer DEFAULT 0,
    model text
);


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    name text NOT NULL,
    role_template text,
    description text,
    system_prompt text,
    capabilities jsonb DEFAULT '[]'::jsonb,
    tools jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    category text DEFAULT 'general'::text,
    template_type text DEFAULT 'custom'::text,
    source_template_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    knowledge_folders jsonb DEFAULT '[]'::jsonb,
    skills jsonb DEFAULT '[]'::jsonb,
    orchestration jsonb DEFAULT '{}'::jsonb,
    boundary jsonb DEFAULT '{}'::jsonb,
    iron_laws jsonb DEFAULT '[]'::jsonb
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid,
    agent_id uuid,
    action character varying(255) NOT NULL,
    resource_type character varying(100),
    resource_id character varying(255),
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bot_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_budgets (
    bot_name character varying(255) NOT NULL,
    daily_limit_usd double precision DEFAULT 0,
    today_spent double precision DEFAULT 0,
    today_tasks integer DEFAULT 0,
    paused boolean DEFAULT false,
    last_rollover date,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bot_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    platform character varying(50) NOT NULL,
    config_json jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bot_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bot_name character varying(255) NOT NULL,
    key_type character varying(100) NOT NULL,
    encrypted_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bot_skill_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_skill_bindings (
    bot_name text NOT NULL,
    skill_name text NOT NULL,
    enabled boolean DEFAULT true,
    installed_at timestamp with time zone DEFAULT now()
);


--
-- Name: budget_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bot_name character varying(255) NOT NULL,
    date date NOT NULL,
    cost_usd double precision DEFAULT 0,
    task_count integer DEFAULT 0
);


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_sessions (
    bot_name character varying(255) NOT NULL,
    chat_id character varying(255) NOT NULL,
    session_id text,
    session_id_engine text,
    working_directory text,
    last_used bigint DEFAULT 0,
    cumulative_tokens bigint DEFAULT 0,
    cumulative_cost_usd double precision DEFAULT 0,
    cumulative_duration_ms bigint DEFAULT 0,
    model character varying(255),
    model_engine character varying(255),
    engine character varying(50),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: clarification_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clarification_sessions (
    id integer NOT NULL,
    user_id text NOT NULL,
    bot_id text NOT NULL,
    target_skill text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    missing_fields jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL
);


--
-- Name: clarification_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clarification_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clarification_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clarification_sessions_id_seq OWNED BY public.clarification_sessions.id;


--
-- Name: coordinator_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coordinator_configs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    group_id text NOT NULL,
    group_name text DEFAULT ''::text NOT NULL,
    coordinator_bot text NOT NULL,
    team_members jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: discovered_group_bots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovered_group_bots (
    chat_id text NOT NULL,
    bot_name text NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: discovered_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovered_groups (
    chat_id text NOT NULL,
    chat_name text DEFAULT ''::text NOT NULL,
    bot_name text DEFAULT ''::text NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_chunks (
    id character varying(255) NOT NULL,
    document_id character varying(255) NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    heading character varying(500),
    embedding public.vector(1024),
    created_at character varying(100)
);


--
-- Name: document_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_mappings (
    memory_doc_id text NOT NULL,
    memory_path text,
    feishu_node_token text,
    feishu_doc_id text,
    content_hash text,
    synced_at text
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    title text NOT NULL,
    folder_id text,
    path text NOT NULL,
    content text DEFAULT ''::text,
    tags jsonb DEFAULT '[]'::jsonb,
    created_by text DEFAULT ''::text,
    created_at text,
    updated_at text,
    embedding public.vector(1024),
    content_hash text DEFAULT ''::text,
    summary text DEFAULT ''::text,
    quality_score integer DEFAULT 0,
    feedback_count integer DEFAULT 0,
    file_url text DEFAULT ''::text
);


--
-- Name: folder_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folder_mappings (
    memory_folder_id text NOT NULL,
    memory_path text,
    feishu_node_token text
);


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id text NOT NULL,
    name text NOT NULL,
    parent_id text,
    path text NOT NULL,
    visibility text DEFAULT 'shared'::text,
    created_at text,
    updated_at text
);


--
-- Name: group_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_memberships (
    id integer NOT NULL,
    group_id text NOT NULL,
    bot_name text NOT NULL,
    joined_at bigint
);


--
-- Name: group_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.group_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.group_memberships_id_seq OWNED BY public.group_memberships.id;


--
-- Name: memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memories (
    id text NOT NULL,
    content text NOT NULL,
    layer integer DEFAULT 1,
    user_id text NOT NULL,
    agent_id text,
    tenant_id text NOT NULL,
    importance double precision DEFAULT 0.5,
    access_count integer DEFAULT 0,
    last_accessed timestamp with time zone,
    embedding public.vector(1024),
    metadata_json jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: memory_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_configs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'openai'::text NOT NULL,
    base_url text DEFAULT ''::text NOT NULL,
    api_key_encrypted text,
    model text DEFAULT ''::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recurring_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bot_name character varying(255) NOT NULL,
    chat_id character varying(255) NOT NULL,
    prompt text NOT NULL,
    cron_expr character varying(100) NOT NULL,
    timezone character varying(100) DEFAULT 'Asia/Shanghai'::character varying,
    status character varying(50) DEFAULT 'active'::character varying,
    next_execute_at bigint NOT NULL,
    created_at bigint DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: routing_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routing_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id character varying(255) NOT NULL,
    pattern text,
    target_bots text[] NOT NULL,
    priority integer DEFAULT 50,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: scheduled_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bot_name character varying(255) NOT NULL,
    chat_id character varying(255) NOT NULL,
    prompt text NOT NULL,
    execute_at bigint NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    parent_recurring_id uuid,
    created_at bigint DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: session_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_links (
    id integer NOT NULL,
    session_id uuid,
    chat_id text NOT NULL,
    platform text,
    linked_at bigint
);


--
-- Name: session_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.session_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: session_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.session_links_id_seq OWNED BY public.session_links.id;


--
-- Name: session_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_messages (
    id integer NOT NULL,
    session_id uuid,
    role text NOT NULL,
    text text,
    platform text,
    cost_usd double precision,
    duration_ms integer,
    "timestamp" bigint
);


--
-- Name: session_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.session_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: session_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.session_messages_id_seq OWNED BY public.session_messages.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid NOT NULL,
    bot_name text NOT NULL,
    claude_session_id text,
    working_directory text,
    title text,
    platform text,
    chat_id text,
    created_at bigint,
    updated_at bigint
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    version integer DEFAULT 1,
    author text DEFAULT ''::text,
    tags jsonb DEFAULT '[]'::jsonb,
    user_invocable integer DEFAULT 1,
    context text,
    allowed_tools text,
    skill_md text,
    references_tar bytea,
    published_at text,
    updated_at text,
    scope text DEFAULT 'global'::text,
    owner_bot text,
    enabled_by_default boolean DEFAULT true
);


--
-- Name: sync_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_config (
    key text NOT NULL,
    value text
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id text NOT NULL,
    name text NOT NULL,
    members jsonb DEFAULT '[]'::jsonb,
    roles jsonb DEFAULT '{}'::jsonb,
    budget_daily_usd double precision DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    category character varying(100) DEFAULT 'employee'::character varying,
    template_type character varying(50) DEFAULT 'role'::character varying,
    system_prompt text,
    chapters jsonb DEFAULT '{}'::jsonb,
    default_skills jsonb DEFAULT '[]'::jsonb,
    default_agents jsonb DEFAULT '[]'::jsonb,
    default_knowledge_folders jsonb DEFAULT '[]'::jsonb,
    default_engine character varying(50) DEFAULT 'claude'::character varying,
    default_model character varying(100),
    default_context_window integer DEFAULT 200000,
    default_max_turns integer,
    version character varying(20) DEFAULT '1.0.0'::character varying,
    is_active boolean DEFAULT true,
    source_file character varying(500),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    email text,
    name text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    is_active boolean DEFAULT true,
    password_hash text,
    avatar_url text,
    feishu_user_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: voice_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_identities (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(50),
    registered_at bigint DEFAULT 0,
    default_bot_team jsonb,
    permissions jsonb,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: board; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.board (
    board_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    description character varying(500) NOT NULL,
    parameters jsonb NOT NULL,
    user_id uuid,
    team_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone
);


--
-- Name: event_data; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.event_data (
    event_data_id uuid NOT NULL,
    website_id uuid NOT NULL,
    website_event_id uuid NOT NULL,
    data_key character varying(500) NOT NULL,
    string_value character varying(500),
    number_value numeric(19,4),
    date_value timestamp(6) with time zone,
    data_type integer NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: link; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.link (
    link_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    url character varying(500) NOT NULL,
    slug character varying(100) NOT NULL,
    user_id uuid,
    team_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone,
    deleted_at timestamp(6) with time zone
);


--
-- Name: pixel; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.pixel (
    pixel_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    user_id uuid,
    team_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone,
    deleted_at timestamp(6) with time zone
);


--
-- Name: report; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.report (
    report_id uuid NOT NULL,
    user_id uuid NOT NULL,
    website_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    description character varying(500) NOT NULL,
    parameters jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone
);


--
-- Name: revenue; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.revenue (
    revenue_id uuid NOT NULL,
    website_id uuid NOT NULL,
    session_id uuid NOT NULL,
    event_id uuid NOT NULL,
    event_name character varying(50) NOT NULL,
    currency character varying(10) NOT NULL,
    revenue numeric(19,4),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: segment; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.segment (
    segment_id uuid NOT NULL,
    website_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    parameters jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone
);


--
-- Name: session; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.session (
    session_id uuid NOT NULL,
    website_id uuid NOT NULL,
    browser character varying(20),
    os character varying(20),
    device character varying(20),
    screen character varying(11),
    language character varying(35),
    country character(2),
    region character varying(20),
    city character varying(50),
    distinct_id character varying(50),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: session_data; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.session_data (
    session_data_id uuid NOT NULL,
    website_id uuid NOT NULL,
    session_id uuid NOT NULL,
    data_key character varying(500) NOT NULL,
    string_value character varying(500),
    number_value numeric(19,4),
    date_value timestamp(6) with time zone,
    data_type integer NOT NULL,
    distinct_id character varying(50),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: session_replay; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.session_replay (
    replay_id uuid NOT NULL,
    website_id uuid NOT NULL,
    session_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    events bytea NOT NULL,
    event_count integer NOT NULL,
    started_at timestamp(6) with time zone NOT NULL,
    ended_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: session_replay_saved; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.session_replay_saved (
    saved_replay_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    website_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone
);


--
-- Name: share; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.share (
    share_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    share_type integer NOT NULL,
    slug character varying(100) NOT NULL,
    parameters jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone
);


--
-- Name: team; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.team (
    team_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    access_code character varying(50),
    logo_url character varying(2183),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone,
    deleted_at timestamp(6) with time zone
);


--
-- Name: team_user; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.team_user (
    team_user_id uuid NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone
);


--
-- Name: user; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami."user" (
    user_id uuid NOT NULL,
    username character varying(255) NOT NULL,
    password character varying(60) NOT NULL,
    role character varying(50) NOT NULL,
    logo_url character varying(2183),
    display_name character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone,
    deleted_at timestamp(6) with time zone
);


--
-- Name: website; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.website (
    website_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    domain character varying(500),
    reset_at timestamp(6) with time zone,
    user_id uuid,
    team_id uuid,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(6) with time zone,
    deleted_at timestamp(6) with time zone,
    replay_enabled boolean DEFAULT false NOT NULL,
    replay_config jsonb
);


--
-- Name: website_event; Type: TABLE; Schema: umami; Owner: -
--

CREATE TABLE umami.website_event (
    event_id uuid NOT NULL,
    website_id uuid NOT NULL,
    session_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP,
    url_path character varying(500) NOT NULL,
    url_query character varying(500),
    utm_source character varying(255),
    utm_medium character varying(255),
    utm_campaign character varying(255),
    utm_content character varying(255),
    utm_term character varying(255),
    referrer_path character varying(500),
    referrer_query character varying(500),
    referrer_domain character varying(500),
    page_title character varying(500),
    gclid character varying(255),
    fbclid character varying(255),
    msclkid character varying(255),
    ttclid character varying(255),
    li_fat_id character varying(255),
    twclid character varying(255),
    event_type integer DEFAULT 1 NOT NULL,
    event_name character varying(50),
    tag character varying(50),
    hostname character varying(100),
    lcp numeric(10,1),
    inp numeric(10,1),
    cls numeric(10,4),
    fcp numeric(10,1),
    ttfb numeric(10,1)
);


--
-- Name: _journal idx; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._journal ALTER COLUMN idx SET DEFAULT nextval('public._journal_idx_seq'::regclass);


--
-- Name: clarification_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarification_sessions ALTER COLUMN id SET DEFAULT nextval('public.clarification_sessions_id_seq'::regclass);


--
-- Name: group_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_memberships ALTER COLUMN id SET DEFAULT nextval('public.group_memberships_id_seq'::regclass);


--
-- Name: session_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_links ALTER COLUMN id SET DEFAULT nextval('public.session_links_id_seq'::regclass);


--
-- Name: session_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_messages ALTER COLUMN id SET DEFAULT nextval('public.session_messages_id_seq'::regclass);


--
-- Name: _journal _journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._journal
    ADD CONSTRAINT _journal_pkey PRIMARY KEY (idx);


--
-- Name: activity_events activity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bot_budgets bot_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_budgets
    ADD CONSTRAINT bot_budgets_pkey PRIMARY KEY (bot_name);


--
-- Name: bot_configs bot_configs_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_configs
    ADD CONSTRAINT bot_configs_name_key UNIQUE (name);


--
-- Name: bot_configs bot_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_configs
    ADD CONSTRAINT bot_configs_pkey PRIMARY KEY (id);


--
-- Name: bot_secrets bot_secrets_bot_name_key_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_secrets
    ADD CONSTRAINT bot_secrets_bot_name_key_type_key UNIQUE (bot_name, key_type);


--
-- Name: bot_secrets bot_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_secrets
    ADD CONSTRAINT bot_secrets_pkey PRIMARY KEY (id);


--
-- Name: bot_skill_bindings bot_skill_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_skill_bindings
    ADD CONSTRAINT bot_skill_bindings_pkey PRIMARY KEY (bot_name, skill_name);


--
-- Name: budget_history budget_history_bot_name_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_history
    ADD CONSTRAINT budget_history_bot_name_date_key UNIQUE (bot_name, date);


--
-- Name: budget_history budget_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_history
    ADD CONSTRAINT budget_history_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (bot_name, chat_id);


--
-- Name: clarification_sessions clarification_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarification_sessions
    ADD CONSTRAINT clarification_sessions_pkey PRIMARY KEY (id);


--
-- Name: coordinator_configs coordinator_configs_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_configs
    ADD CONSTRAINT coordinator_configs_group_id_key UNIQUE (group_id);


--
-- Name: coordinator_configs coordinator_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_configs
    ADD CONSTRAINT coordinator_configs_pkey PRIMARY KEY (id);


--
-- Name: discovered_group_bots discovered_group_bots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovered_group_bots
    ADD CONSTRAINT discovered_group_bots_pkey PRIMARY KEY (chat_id, bot_name);


--
-- Name: discovered_groups discovered_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovered_groups
    ADD CONSTRAINT discovered_groups_pkey PRIMARY KEY (chat_id);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: document_mappings document_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_mappings
    ADD CONSTRAINT document_mappings_pkey PRIMARY KEY (memory_doc_id);


--
-- Name: documents documents_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_path_key UNIQUE (path);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: folder_mappings folder_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_mappings
    ADD CONSTRAINT folder_mappings_pkey PRIMARY KEY (memory_folder_id);


--
-- Name: folders folders_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_path_key UNIQUE (path);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: group_memberships group_memberships_group_id_bot_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_memberships
    ADD CONSTRAINT group_memberships_group_id_bot_name_key UNIQUE (group_id, bot_name);


--
-- Name: group_memberships group_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_memberships
    ADD CONSTRAINT group_memberships_pkey PRIMARY KEY (id);


--
-- Name: memories memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);


--
-- Name: memory_settings memory_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_settings
    ADD CONSTRAINT memory_settings_pkey PRIMARY KEY (key);


--
-- Name: provider_configs provider_configs_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_configs
    ADD CONSTRAINT provider_configs_name_key UNIQUE (name);


--
-- Name: provider_configs provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_configs
    ADD CONSTRAINT provider_configs_pkey PRIMARY KEY (id);


--
-- Name: recurring_tasks recurring_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_tasks
    ADD CONSTRAINT recurring_tasks_pkey PRIMARY KEY (id);


--
-- Name: routing_bindings routing_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_bindings
    ADD CONSTRAINT routing_bindings_pkey PRIMARY KEY (id);


--
-- Name: scheduled_tasks scheduled_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_tasks
    ADD CONSTRAINT scheduled_tasks_pkey PRIMARY KEY (id);


--
-- Name: session_links session_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_links
    ADD CONSTRAINT session_links_pkey PRIMARY KEY (id);


--
-- Name: session_links session_links_session_id_chat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_links
    ADD CONSTRAINT session_links_session_id_chat_id_key UNIQUE (session_id, chat_id);


--
-- Name: session_messages session_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_messages
    ADD CONSTRAINT session_messages_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: skills skills_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_name_key UNIQUE (name);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: sync_config sync_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_config
    ADD CONSTRAINT sync_config_pkey PRIMARY KEY (key);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: templates templates_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_name_key UNIQUE (name);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: clarification_sessions uniq_clarification_session; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarification_sessions
    ADD CONSTRAINT uniq_clarification_session UNIQUE (user_id, bot_id, target_skill);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: voice_identities voice_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_identities
    ADD CONSTRAINT voice_identities_pkey PRIMARY KEY (id);


--
-- Name: board board_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.board
    ADD CONSTRAINT board_pkey PRIMARY KEY (board_id);


--
-- Name: event_data event_data_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.event_data
    ADD CONSTRAINT event_data_pkey PRIMARY KEY (event_data_id);


--
-- Name: link link_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.link
    ADD CONSTRAINT link_pkey PRIMARY KEY (link_id);


--
-- Name: pixel pixel_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.pixel
    ADD CONSTRAINT pixel_pkey PRIMARY KEY (pixel_id);


--
-- Name: report report_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.report
    ADD CONSTRAINT report_pkey PRIMARY KEY (report_id);


--
-- Name: revenue revenue_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.revenue
    ADD CONSTRAINT revenue_pkey PRIMARY KEY (revenue_id);


--
-- Name: segment segment_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.segment
    ADD CONSTRAINT segment_pkey PRIMARY KEY (segment_id);


--
-- Name: session_data session_data_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.session_data
    ADD CONSTRAINT session_data_pkey PRIMARY KEY (session_data_id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (session_id);


--
-- Name: session_replay session_replay_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.session_replay
    ADD CONSTRAINT session_replay_pkey PRIMARY KEY (replay_id);


--
-- Name: session_replay_saved session_replay_saved_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.session_replay_saved
    ADD CONSTRAINT session_replay_saved_pkey PRIMARY KEY (saved_replay_id);


--
-- Name: share share_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.share
    ADD CONSTRAINT share_pkey PRIMARY KEY (share_id);


--
-- Name: team team_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.team
    ADD CONSTRAINT team_pkey PRIMARY KEY (team_id);


--
-- Name: team_user team_user_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.team_user
    ADD CONSTRAINT team_user_pkey PRIMARY KEY (team_user_id);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (user_id);


--
-- Name: website_event website_event_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.website_event
    ADD CONSTRAINT website_event_pkey PRIMARY KEY (event_id);


--
-- Name: website website_pkey; Type: CONSTRAINT; Schema: umami; Owner: -
--

ALTER TABLE ONLY umami.website
    ADD CONSTRAINT website_pkey PRIMARY KEY (website_id);


--
-- Name: document_chunks_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_chunks_doc_idx ON public.document_chunks USING btree (document_id);


--
-- Name: idx_activity_bot_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_bot_name ON public.activity_events USING btree (bot_name);


--
-- Name: idx_activity_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_timestamp ON public.activity_events USING btree ("timestamp");


--
-- Name: idx_clarification_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clarification_expires ON public.clarification_sessions USING btree (expires_at);


--
-- Name: idx_clarification_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clarification_status ON public.clarification_sessions USING btree (status);


--
-- Name: idx_clarification_user_bot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clarification_user_bot ON public.clarification_sessions USING btree (user_id, bot_id);


--
-- Name: board_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX board_created_at_idx ON umami.board USING btree (created_at);


--
-- Name: board_team_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX board_team_id_idx ON umami.board USING btree (team_id);


--
-- Name: board_user_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX board_user_id_idx ON umami.board USING btree (user_id);


--
-- Name: event_data_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX event_data_created_at_idx ON umami.event_data USING btree (created_at);


--
-- Name: event_data_website_event_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX event_data_website_event_id_idx ON umami.event_data USING btree (website_event_id);


--
-- Name: event_data_website_id_created_at_data_key_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX event_data_website_id_created_at_data_key_idx ON umami.event_data USING btree (website_id, created_at, data_key);


--
-- Name: event_data_website_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX event_data_website_id_created_at_idx ON umami.event_data USING btree (website_id, created_at);


--
-- Name: event_data_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX event_data_website_id_idx ON umami.event_data USING btree (website_id);


--
-- Name: link_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX link_created_at_idx ON umami.link USING btree (created_at);


--
-- Name: link_slug_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX link_slug_idx ON umami.link USING btree (slug);


--
-- Name: link_slug_key; Type: INDEX; Schema: umami; Owner: -
--

CREATE UNIQUE INDEX link_slug_key ON umami.link USING btree (slug);


--
-- Name: link_team_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX link_team_id_idx ON umami.link USING btree (team_id);


--
-- Name: link_user_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX link_user_id_idx ON umami.link USING btree (user_id);


--
-- Name: pixel_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX pixel_created_at_idx ON umami.pixel USING btree (created_at);


--
-- Name: pixel_slug_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX pixel_slug_idx ON umami.pixel USING btree (slug);


--
-- Name: pixel_slug_key; Type: INDEX; Schema: umami; Owner: -
--

CREATE UNIQUE INDEX pixel_slug_key ON umami.pixel USING btree (slug);


--
-- Name: pixel_team_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX pixel_team_id_idx ON umami.pixel USING btree (team_id);


--
-- Name: pixel_user_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX pixel_user_id_idx ON umami.pixel USING btree (user_id);


--
-- Name: report_name_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX report_name_idx ON umami.report USING btree (name);


--
-- Name: report_type_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX report_type_idx ON umami.report USING btree (type);


--
-- Name: report_user_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX report_user_id_idx ON umami.report USING btree (user_id);


--
-- Name: report_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX report_website_id_idx ON umami.report USING btree (website_id);


--
-- Name: revenue_session_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX revenue_session_id_idx ON umami.revenue USING btree (session_id);


--
-- Name: revenue_website_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX revenue_website_id_created_at_idx ON umami.revenue USING btree (website_id, created_at);


--
-- Name: revenue_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX revenue_website_id_idx ON umami.revenue USING btree (website_id);


--
-- Name: revenue_website_id_session_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX revenue_website_id_session_id_created_at_idx ON umami.revenue USING btree (website_id, session_id, created_at);


--
-- Name: segment_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX segment_website_id_idx ON umami.segment USING btree (website_id);


--
-- Name: session_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_created_at_idx ON umami.session USING btree (created_at);


--
-- Name: session_data_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_data_created_at_idx ON umami.session_data USING btree (created_at);


--
-- Name: session_data_session_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_data_session_id_created_at_idx ON umami.session_data USING btree (session_id, created_at);


--
-- Name: session_data_session_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_data_session_id_idx ON umami.session_data USING btree (session_id);


--
-- Name: session_data_website_id_created_at_data_key_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_data_website_id_created_at_data_key_idx ON umami.session_data USING btree (website_id, created_at, data_key);


--
-- Name: session_data_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_data_website_id_idx ON umami.session_data USING btree (website_id);


--
-- Name: session_replay_saved_visit_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_saved_visit_id_idx ON umami.session_replay_saved USING btree (visit_id);


--
-- Name: session_replay_saved_website_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_saved_website_id_created_at_idx ON umami.session_replay_saved USING btree (website_id, created_at);


--
-- Name: session_replay_saved_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_saved_website_id_idx ON umami.session_replay_saved USING btree (website_id);


--
-- Name: session_replay_saved_website_id_visit_id_key; Type: INDEX; Schema: umami; Owner: -
--

CREATE UNIQUE INDEX session_replay_saved_website_id_visit_id_key ON umami.session_replay_saved USING btree (website_id, visit_id);


--
-- Name: session_replay_session_id_chunk_index_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_session_id_chunk_index_idx ON umami.session_replay USING btree (session_id, chunk_index);


--
-- Name: session_replay_session_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_session_id_idx ON umami.session_replay USING btree (session_id);


--
-- Name: session_replay_visit_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_visit_id_idx ON umami.session_replay USING btree (visit_id);


--
-- Name: session_replay_website_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_website_id_created_at_idx ON umami.session_replay USING btree (website_id, created_at);


--
-- Name: session_replay_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_website_id_idx ON umami.session_replay USING btree (website_id);


--
-- Name: session_replay_website_id_session_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_website_id_session_id_idx ON umami.session_replay USING btree (website_id, session_id);


--
-- Name: session_replay_website_id_visit_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_replay_website_id_visit_id_idx ON umami.session_replay USING btree (website_id, visit_id);


--
-- Name: session_website_id_created_at_browser_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_browser_idx ON umami.session USING btree (website_id, created_at, browser);


--
-- Name: session_website_id_created_at_city_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_city_idx ON umami.session USING btree (website_id, created_at, city);


--
-- Name: session_website_id_created_at_country_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_country_idx ON umami.session USING btree (website_id, created_at, country);


--
-- Name: session_website_id_created_at_device_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_device_idx ON umami.session USING btree (website_id, created_at, device);


--
-- Name: session_website_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_idx ON umami.session USING btree (website_id, created_at);


--
-- Name: session_website_id_created_at_language_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_language_idx ON umami.session USING btree (website_id, created_at, language);


--
-- Name: session_website_id_created_at_os_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_os_idx ON umami.session USING btree (website_id, created_at, os);


--
-- Name: session_website_id_created_at_region_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_region_idx ON umami.session USING btree (website_id, created_at, region);


--
-- Name: session_website_id_created_at_screen_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_created_at_screen_idx ON umami.session USING btree (website_id, created_at, screen);


--
-- Name: session_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX session_website_id_idx ON umami.session USING btree (website_id);


--
-- Name: share_entity_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX share_entity_id_idx ON umami.share USING btree (entity_id);


--
-- Name: share_slug_key; Type: INDEX; Schema: umami; Owner: -
--

CREATE UNIQUE INDEX share_slug_key ON umami.share USING btree (slug);


--
-- Name: team_access_code_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX team_access_code_idx ON umami.team USING btree (access_code);


--
-- Name: team_access_code_key; Type: INDEX; Schema: umami; Owner: -
--

CREATE UNIQUE INDEX team_access_code_key ON umami.team USING btree (access_code);


--
-- Name: team_user_team_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX team_user_team_id_idx ON umami.team_user USING btree (team_id);


--
-- Name: team_user_user_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX team_user_user_id_idx ON umami.team_user USING btree (user_id);


--
-- Name: user_username_key; Type: INDEX; Schema: umami; Owner: -
--

CREATE UNIQUE INDEX user_username_key ON umami."user" USING btree (username);


--
-- Name: website_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_created_at_idx ON umami.website USING btree (created_at);


--
-- Name: website_created_by_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_created_by_idx ON umami.website USING btree (created_by);


--
-- Name: website_event_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_created_at_idx ON umami.website_event USING btree (created_at);


--
-- Name: website_event_session_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_session_id_idx ON umami.website_event USING btree (session_id);


--
-- Name: website_event_visit_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_visit_id_idx ON umami.website_event USING btree (visit_id);


--
-- Name: website_event_website_id_created_at_event_name_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_created_at_event_name_idx ON umami.website_event USING btree (website_id, created_at, event_name);


--
-- Name: website_event_website_id_created_at_hostname_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_created_at_hostname_idx ON umami.website_event USING btree (website_id, created_at, hostname);


--
-- Name: website_event_website_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_created_at_idx ON umami.website_event USING btree (website_id, created_at);


--
-- Name: website_event_website_id_created_at_page_title_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_created_at_page_title_idx ON umami.website_event USING btree (website_id, created_at, page_title);


--
-- Name: website_event_website_id_created_at_referrer_domain_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_created_at_referrer_domain_idx ON umami.website_event USING btree (website_id, created_at, referrer_domain);


--
-- Name: website_event_website_id_created_at_tag_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_created_at_tag_idx ON umami.website_event USING btree (website_id, created_at, tag);


--
-- Name: website_event_website_id_created_at_url_path_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_created_at_url_path_idx ON umami.website_event USING btree (website_id, created_at, url_path);


--
-- Name: website_event_website_id_created_at_url_query_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_created_at_url_query_idx ON umami.website_event USING btree (website_id, created_at, url_query);


--
-- Name: website_event_website_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_idx ON umami.website_event USING btree (website_id);


--
-- Name: website_event_website_id_session_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_session_id_created_at_idx ON umami.website_event USING btree (website_id, session_id, created_at);


--
-- Name: website_event_website_id_visit_id_created_at_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_event_website_id_visit_id_created_at_idx ON umami.website_event USING btree (website_id, visit_id, created_at);


--
-- Name: website_team_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_team_id_idx ON umami.website USING btree (team_id);


--
-- Name: website_user_id_idx; Type: INDEX; Schema: umami; Owner: -
--

CREATE INDEX website_user_id_idx ON umami.website USING btree (user_id);


--
-- Name: agents agents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: document_chunks document_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: documents documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id);


--
-- Name: session_links session_links_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_links
    ADD CONSTRAINT session_links_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: session_messages session_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_messages
    ADD CONSTRAINT session_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- PostgreSQL database dump complete
--

\unrestrict l498Jzz9Ul2kZgaH0LMUQa4bdK63PHTzDh5vbvEmEc6LDW10DjaXW5iSI8DAcev

