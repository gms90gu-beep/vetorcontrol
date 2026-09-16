--
-- VetorControl — Preparação do schema `public` no Supabase de DESTINO
-- Destino: uwduoupyoltpoetkklfq
-- Origem (somente estrutura): ttjzgszxrnmcsygtzfcu
-- Gerado em 16/09/2026 — NÃO EXECUTADO.
--
-- Escopo:
--   * Somente o schema `public`: enums, tabelas, constraints, índices, views,
--     funções/RPCs, triggers, RLS, policies e GRANTs.
--   * NÃO altera auth, storage, extensions, realtime, vault ou qualquer schema
--     interno do Supabase.
--   * NÃO contém dados (nenhum INSERT/COPY) nem usuários do Auth.
--   * NÃO contém senhas, service-role key, JWT secret ou tokens.
--
-- Pré-requisitos no destino:
--   1. O schema `public` deve estar vazio (sem tabelas com os mesmos nomes).
--   2. Extensões padrão do Supabase (pgcrypto/uuid-ossp em `extensions`) já
--      presentes — `gen_random_uuid()` é usado em defaults.
--   3. As FKs abaixo referenciam `auth.users(id)`. Importe os usuários do Auth
--      preservando os mesmos UUIDs ANTES de importar dados nas tabelas de
--      `public`; a criação da estrutura em si não depende de usuários.
--   4. Políticas de `storage.objects` e os buckets (rg-pdfs, rg-ocr,
--      block-reports) NÃO estão aqui — recriar separadamente no destino.
--   5. `public.supabase_keep_alive` vem sem RLS (igual à origem) — revisar.
--
-- Aplicar com: psql "<connection string do destino>" -f schema-destino-supabase.sql
--

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- Destino já possui o schema public (antigo e vazio): criação condicional.
CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: activity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_type AS ENUM (
    'routine',
    'infestation_survey',
    'pending'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'supervisor',
    'agent',
    'admin_master',
    'coordenador',
    'agente'
);


--
-- Name: block_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.block_status AS ENUM (
    'not_started',
    'in_progress',
    'completed'
);


--
-- Name: cycle_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cycle_status AS ENUM (
    'not_started',
    'in_progress',
    'finished'
);


--
-- Name: property_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.property_status AS ENUM (
    'active',
    'pending',
    'deactivated',
    'absent',
    'not_located',
    'unoccupied',
    'demolished',
    'visited'
);


--
-- Name: property_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.property_type AS ENUM (
    'residence',
    'commerce',
    'vacant_lot',
    'strategic_point',
    'others'
);


--
-- Name: recovery_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recovery_result AS ENUM (
    'closed',
    'refused',
    'absent',
    'not_located',
    'not_done',
    'visited',
    'unoccupied',
    'demolished'
);


--
-- Name: user_role_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role_type AS ENUM (
    'admin_master',
    'coordenador',
    'supervisor',
    'agente'
);


--
-- Name: visit_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.visit_status AS ENUM (
    'visited',
    'closed',
    'refused',
    'abandoned'
);


--
-- Name: week_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.week_status AS ENUM (
    'open',
    'closed'
);


--
-- Name: agent_integrity_check(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.agent_integrity_check(_fix boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total_profiles int;
  v_total_agents int;
  v_missing int;
  v_created int := 0;
BEGIN
  SELECT count(*) INTO v_total_profiles FROM public.profiles;
  SELECT count(*) INTO v_total_agents FROM public.agents;
  SELECT count(*) INTO v_missing
    FROM public.profiles p LEFT JOIN public.agents a ON a.profile_id = p.id
    WHERE a.profile_id IS NULL;

  IF _fix AND v_missing > 0 THEN
    WITH ins AS (
      INSERT INTO public.agents (profile_id, name, status)
      SELECT p.id, COALESCE(NULLIF(p.full_name, ''), p.email, 'Agente'), 'active'
      FROM public.profiles p
      LEFT JOIN public.agents a ON a.profile_id = p.id
      WHERE a.profile_id IS NULL
      ON CONFLICT (profile_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_created FROM ins;

    INSERT INTO public.audit_log(action, entity, actor_id, metadata)
    VALUES ('agent_health_check', 'system', auth.uid(),
      jsonb_build_object('profiles_verificados', v_total_profiles, 'agents_criados', v_created, 'executed_at', now()));
  END IF;

  RETURN jsonb_build_object(
    'total_profiles', v_total_profiles,
    'total_agents', v_total_agents,
    'profiles_sem_agent', v_missing - v_created,
    'agents_criados', v_created
  );
END;
$$;


--
-- Name: auto_data_audit_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_data_audit_snapshot() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_report jsonb;
  v_score int := 100;
  v_alerts int := 0;
  v_id uuid;
BEGIN
  v_report := public.data_audit_report();

  -- Alertas básicos
  v_alerts :=
    COALESCE((v_report->'properties'->>'without_block')::int, 0)
    + COALESCE((v_report->'gps'->>'missing')::int, 0)
    + COALESCE((v_report->'visits'->>'orphan')::int, 0)
    + COALESCE((v_report->'foci'->>'positive_without_deposit')::int, 0)
    + COALESCE((v_report->'users'->>'agents_without_supervisor')::int, 0)
    + CASE WHEN (v_report->'cycles'->>'multiple_in_progress')::boolean THEN 1 ELSE 0 END
    + COALESCE((v_report->'cycles'->>'expired_in_progress')::int, 0);

  INSERT INTO public.data_audit_snapshots
    (score, alerts_count, actions_count, module_scores, report, user_id)
  VALUES
    (v_score, v_alerts, 0, '{}'::jsonb, v_report, NULL)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'alerts', v_alerts);
END;
$$;


--
-- Name: autoheal_agent(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.autoheal_agent(_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_agent_id uuid;
  v_profile record;
BEGIN
  SELECT id INTO v_agent_id FROM public.agents WHERE profile_id = _user_id;
  IF v_agent_id IS NOT NULL THEN
    RETURN v_agent_id;
  END IF;

  SELECT id, full_name, email INTO v_profile FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.agents (profile_id, name, status)
  VALUES (v_profile.id, COALESCE(NULLIF(v_profile.full_name, ''), v_profile.email, 'Agente'), 'active')
  ON CONFLICT (profile_id) DO NOTHING
  RETURNING id INTO v_agent_id;

  IF v_agent_id IS NULL THEN
    SELECT id INTO v_agent_id FROM public.agents WHERE profile_id = _user_id;
  END IF;

  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES ('autoheal_agent', 'agent', _user_id, v_agent_id, jsonb_build_object('created_at', now()));

  RETURN v_agent_id;
END;
$$;


--
-- Name: calculate_daily_metrics_v2(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_daily_metrics_v2(p_agent_id uuid, p_cycle_id uuid, p_work_date date) RETURNS TABLE(total_properties bigint, visited_count bigint, closed_count bigint, pending_count bigint, accuracy double precision)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  WITH agent_cycle_properties AS (
    SELECT 
      p.id as property_id,
      COALESCE(
        (SELECT status 
         FROM daily_work_records dwr 
         WHERE dwr.agent_id = p_agent_id 
           AND dwr.cycle_id = p_cycle_id
           AND dwr.work_date <= p_work_date
         ORDER BY dwr.created_at DESC 
         LIMIT 1),
        'pending'
      ) as current_status
    FROM properties p
    WHERE p.agent_id = p_agent_id 
      AND p.cycle_id = p_cycle_id
  )
  SELECT 
    COUNT(DISTINCT property_id)::BIGINT as total_properties,
    COUNT(*) FILTER (WHERE current_status = 'visited')::BIGINT as visited_count,
    COUNT(*) FILTER (WHERE current_status = 'closed')::BIGINT as closed_count,
    COUNT(*) FILTER (WHERE current_status = 'pending')::BIGINT as pending_count,
    (COUNT(*) FILTER (WHERE current_status IN ('visited', 'closed')) * 100.0 / 
     NULLIF(COUNT(DISTINCT property_id), 0))::FLOAT as accuracy
  FROM agent_cycle_properties;
END;
$$;


--
-- Name: can_supervise_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_supervise_user(target_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    -- self
    auth.uid() = target_user_id
    -- admin master: unrestricted
    OR public.get_user_role(auth.uid()) = 'admin_master'
    -- coordenador: own supervisors + agents under those supervisors
    OR (
      public.get_user_role(auth.uid()) = 'coordenador'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = target_user_id
          AND (
            p.coordinator_id = auth.uid()
            OR p.supervisor_id IN (
              SELECT s.id FROM public.profiles s WHERE s.coordinator_id = auth.uid()
            )
          )
      )
    )
    -- supervisor: own agents
    OR (
      public.get_user_role(auth.uid()) = 'supervisor'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = target_user_id AND p.supervisor_id = auth.uid()
      )
    );
$$;


--
-- Name: check_and_alert_hibernation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_alert_hibernation() RETURNS TABLE(alert_level text, message text, action_required text, is_critical boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_last_ping TIMESTAMPTZ;
  v_minutes_ago INTEGER;
BEGIN
  SELECT MAX(ping_timestamp) INTO v_last_ping FROM supabase_keep_alive;
  
  IF v_last_ping IS NULL THEN
    v_last_ping := NOW();
  END IF;
  
  v_minutes_ago := EXTRACT(EPOCH FROM (NOW() - v_last_ping))::INTEGER / 60;
  
  RETURN QUERY
  SELECT
    CASE 
      WHEN v_minutes_ago > 10080 THEN 'CRÍTICO'::TEXT
      WHEN v_minutes_ago > 8640 THEN 'ALTO'::TEXT
      WHEN v_minutes_ago > 4320 THEN 'MÉDIO'::TEXT
      ELSE 'NORMAL'::TEXT
    END as alert_level,
    CASE 
      WHEN v_minutes_ago > 10080 THEN '⏸️ Projeto hibernado! (7+ dias sem atividade)'::TEXT
      WHEN v_minutes_ago > 8640 THEN '⚠️ Risco iminente de hibernação (6+ dias)'::TEXT
      WHEN v_minutes_ago > 4320 THEN '📌 Risco moderado de hibernação (3+ dias)'::TEXT
      ELSE '✅ Projeto ativo e protegido'::TEXT
    END as message,
    CASE 
      WHEN v_minutes_ago > 10080 THEN 'Executar health_check() IMEDIATAMENTE'::TEXT
      WHEN v_minutes_ago > 8640 THEN 'Executar health_check() nos próximos 30 minutos'::TEXT
      WHEN v_minutes_ago > 4320 THEN 'Verificar se keep-alive está ativo'::TEXT
      ELSE 'Nenhuma ação necessária'::TEXT
    END as action_required,
    (v_minutes_ago > 10080)::BOOLEAN as is_critical;
END;
$$;


--
-- Name: check_and_delete_empty_block(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_delete_empty_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    prop_count integer;
BEGIN
    SELECT count(*) INTO prop_count FROM public.properties WHERE block_id = OLD.block_id;
    IF prop_count = 0 AND OLD.block_id IS NOT NULL THEN
        DELETE FROM public.blocks WHERE id = OLD.block_id;
    END IF;
    RETURN OLD;
END;
$$;


--
-- Name: check_and_delete_empty_block_on_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_delete_empty_block_on_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    prop_count integer;
BEGIN
    IF OLD.block_number IS DISTINCT FROM NEW.block_number THEN
        SELECT count(*) INTO prop_count FROM public.properties WHERE block_number = OLD.block_number;
        IF prop_count = 0 THEN
            DELETE FROM public.blocks WHERE number = OLD.block_number;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: check_block_completion(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_block_completion(p_block_id uuid, p_cycle_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    v_total_properties INTEGER;
    v_visited_properties INTEGER;
    v_new_status public.block_status;
BEGIN
    SELECT count(*) INTO v_total_properties FROM public.properties WHERE block_id = p_block_id;
    SELECT count(DISTINCT property_id) INTO v_visited_properties
    FROM public.visits
    WHERE cycle_id = p_cycle_id
    AND property_id IN (SELECT id FROM public.properties WHERE block_id = p_block_id);

    IF v_total_properties > 0 AND v_visited_properties >= v_total_properties THEN
        v_new_status := 'completed'::public.block_status;
    ELSIF v_visited_properties > 0 THEN
        v_new_status := 'in_progress'::public.block_status;
    ELSE
        v_new_status := 'not_started'::public.block_status;
    END IF;

    RAISE LOG '[BLOCK_STATUS_SENT] block=% cycle=% status=%', p_block_id, p_cycle_id, v_new_status;
    RAISE LOG '[BLOCK_STATUS_DATABASE] allowed=not_started,in_progress,completed';

    BEGIN
        UPDATE public.blocks SET status = v_new_status WHERE id = p_block_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE LOG '[BLOCK_STATUS_ERROR] block=% attempted=% error=%', p_block_id, v_new_status, SQLERRM;
        RAISE;
    END;
END;
$$;


--
-- Name: check_cycle_status_for_visit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_cycle_status_for_visit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    c_status cycle_status;
BEGIN
    SELECT status INTO c_status FROM public.cycles WHERE id = NEW.cycle_id;
    
    IF c_status = 'finished' THEN
        RAISE EXCEPTION 'Não é possível registrar visitas em um ciclo concluído.';
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: check_hibernation_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_hibernation_status() RETURNS TABLE(is_hibernated boolean, last_activity timestamp with time zone, minutes_since_activity integer, recommendation text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  last_ping TIMESTAMPTZ;
  minutes_diff INTEGER;
BEGIN
  SELECT MAX(ping_timestamp) INTO last_ping FROM supabase_keep_alive;
  
  IF last_ping IS NULL THEN
    last_ping := NOW();
  END IF;
  
  minutes_diff := EXTRACT(EPOCH FROM (NOW() - last_ping))::INTEGER / 60;
  
  RETURN QUERY
  SELECT 
    (minutes_diff > 10080)::BOOLEAN as is_hibernated,
    last_ping as last_activity,
    minutes_diff as minutes_since_activity,
    CASE 
      WHEN minutes_diff > 10080 THEN '⏸️ Projeto hibernado! Executar: SELECT health_check();'
      WHEN minutes_diff > 8640 THEN '⚠️ Risco de hibernação. Execute health_check() agora!'
      WHEN minutes_diff > 4320 THEN '📌 Moderado risco. Verificar se keep-alive está ativo'
      ELSE '✅ Status normal. Projeto ativo.'
    END::TEXT as recommendation;
END;
$$;


--
-- Name: cleanup_demo_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_demo_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  c integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(v_uid, 'admin_master'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: requer admin_master';
  END IF;

  DELETE FROM public.visit_deposits;    GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('visit_deposits', c);
  DELETE FROM public.visits;            GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('visits', c);
  DELETE FROM public.weekly_bulletins;  GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('weekly_bulletins', c);
  DELETE FROM public.daily_work_records;GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('daily_work_records', c);
  DELETE FROM public.field_work_sessions;GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('field_work_sessions', c);
  DELETE FROM public.rg_pdf_exports;    GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('rg_pdf_exports', c);
  DELETE FROM public.rg_ocr_imports;    GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('rg_ocr_imports', c);
  DELETE FROM public.rg_uploads;        GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('rg_uploads', c);
  DELETE FROM public.properties;        GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('properties', c);
  DELETE FROM public.boletins_rg;       GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('boletins_rg', c);
  DELETE FROM public.blocks;            GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('blocks', c);

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('cleanup_demo_data', 'system', v_uid, v_counts);

  RETURN v_counts;
END;
$$;


--
-- Name: cleanup_old_pings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_pings() RETURNS TABLE(deleted_count bigint, message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  DELETE FROM supabase_keep_alive
  WHERE ping_timestamp < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN QUERY
  SELECT 
    v_deleted as deleted_count,
    format('Removidos %s registros antigos de keep-alive', v_deleted)::TEXT as message;
END;
$$;


--
-- Name: close_week(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_week(_week_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE w record; next_week_id uuid; next_cycle_id uuid;
BEGIN
  SELECT * INTO w FROM public.weeks WHERE id = _week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Semana não encontrada'; END IF;
  UPDATE public.weeks SET status = 'closed', updated_at = now() WHERE id = _week_id;
  IF w.number < 8 THEN
    UPDATE public.weeks SET status = 'open' WHERE cycle_id = w.cycle_id AND number = w.number + 1
      RETURNING id INTO next_week_id;
    RETURN jsonb_build_object('closed_week', w.number, 'next_week_id', next_week_id);
  END IF;
  UPDATE public.cycles SET status = 'finished' WHERE id = w.cycle_id;
  SELECT id INTO next_cycle_id FROM public.cycles
    WHERE year >= (SELECT year FROM public.cycles WHERE id = w.cycle_id)
      AND status = 'not_started'
    ORDER BY year, number LIMIT 1;
  IF next_cycle_id IS NOT NULL THEN
    UPDATE public.cycles SET status = 'in_progress' WHERE id = next_cycle_id;
  END IF;
  RETURN jsonb_build_object('closed_week', 8, 'cycle_finished', w.cycle_id, 'next_cycle_id', next_cycle_id);
END $$;


--
-- Name: daily_activity_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.daily_activity_report() RETURNS TABLE(data date, total_pings integer, app_pings integer, github_pings integer, manual_pings integer, success_rate numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(ping_timestamp)::DATE as data,
    COUNT(*)::INTEGER as total_pings,
    COUNT(*) FILTER (WHERE ping_source = 'app')::INTEGER as app_pings,
    COUNT(*) FILTER (WHERE ping_source = 'github_actions')::INTEGER as github_pings,
    COUNT(*) FILTER (WHERE ping_source = 'manual')::INTEGER as manual_pings,
    ROUND(
      COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / 
      COUNT(*)::NUMERIC * 100,
      2
    ) as success_rate
  FROM supabase_keep_alive
  WHERE ping_timestamp > NOW() - INTERVAL '7 days'
  GROUP BY DATE(ping_timestamp)
  ORDER BY DATE(ping_timestamp) DESC;
END;
$$;


--
-- Name: data_audit_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.data_audit_report() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  today date := public.operational_date(now());
BEGIN
  -- RG (quarteirões)
  v := v || jsonb_build_object('rg', jsonb_build_object(
    'total_blocks', (SELECT count(*) FROM blocks),
    'blocks_with_properties', (SELECT count(DISTINCT block_id) FROM properties WHERE block_id IS NOT NULL),
    'blocks_without_properties', (SELECT count(*) FROM blocks b WHERE NOT EXISTS (SELECT 1 FROM properties p WHERE p.block_id = b.id)),
    'duplicated_blocks', (SELECT count(*) FROM (SELECT number FROM blocks GROUP BY number HAVING count(*) > 1) x),
    'blocks_without_owner', (SELECT count(DISTINCT b.id) FROM blocks b LEFT JOIN boletins_rg br ON br.block_number = b.number WHERE br.agent_id IS NULL),
    'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'block', b.number,
        'agent', (SELECT p.full_name FROM boletins_rg br LEFT JOIN profiles p ON p.id = br.agent_id WHERE br.block_number = b.number LIMIT 1),
        'properties', (SELECT count(*) FROM properties pp WHERE pp.block_id = b.id),
        'status', b.status
      )), '[]'::jsonb) FROM (SELECT * FROM blocks ORDER BY created_at DESC LIMIT 25) b)
  ));

  -- Imóveis
  v := v || jsonb_build_object('properties', jsonb_build_object(
    'total', (SELECT count(*) FROM properties),
    'without_block', (SELECT count(*) FROM properties WHERE block_id IS NULL AND block_number IS NULL),
    'without_boletim', (SELECT count(*) FROM properties WHERE boletim_id IS NULL),
    'without_street', (SELECT count(*) FROM properties WHERE (street_name IS NULL OR street_name = '') AND street_id IS NULL),
    'without_number', (SELECT count(*) FROM properties WHERE number IS NULL OR number = ''),
    'without_user', (SELECT count(*) FROM properties WHERE user_id IS NULL),
    'duplicates', (SELECT count(*) FROM (
      SELECT block_number, number, street_name FROM properties
       WHERE block_number IS NOT NULL AND number IS NOT NULL
       GROUP BY block_number, number, street_name HAVING count(*) > 1) d)
  ));

  -- GPS
  v := v || jsonb_build_object('gps', jsonb_build_object(
    'total', (SELECT count(*) FROM properties),
    'geocoded', (SELECT count(*) FROM properties WHERE latitude IS NOT NULL AND longitude IS NOT NULL),
    'missing', (SELECT count(*) FROM properties WHERE latitude IS NULL OR longitude IS NULL),
    'invalid', (SELECT count(*) FROM properties
                 WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
                    OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))),
    'duplicated_coords', (SELECT count(*) FROM (
      SELECT latitude, longitude FROM properties
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       GROUP BY latitude, longitude HAVING count(*) > 1) d)
  ));

  -- Visitas
  v := v || jsonb_build_object('visits', jsonb_build_object(
    'total', (SELECT count(*) FROM visits),
    'without_property', (SELECT count(*) FROM visits WHERE property_id IS NULL),
    'without_agent', (SELECT count(*) FROM visits WHERE agent_id IS NULL),
    'without_date', (SELECT count(*) FROM visits WHERE visit_date IS NULL),
    'orphan', (SELECT count(*) FROM visits v LEFT JOIN properties p ON p.id = v.property_id WHERE p.id IS NULL),
    'without_cycle', (SELECT count(*) FROM visits WHERE cycle_id IS NULL)
  ));

  -- Focos
  v := v || jsonb_build_object('foci', jsonb_build_object(
    'positive_visits', (SELECT count(*) FROM visits WHERE has_focus = true),
    'deposits_total', (SELECT count(*) FROM visit_deposits),
    'positive_without_deposit', (SELECT count(*) FROM visits v WHERE v.has_focus = true AND NOT EXISTS (SELECT 1 FROM visit_deposits d WHERE d.visit_id = v.id)),
    'positive_deposit_without_visit', (SELECT count(*) FROM visit_deposits d LEFT JOIN visits v ON v.id = d.visit_id WHERE d.is_positive = true AND v.id IS NULL),
    'deposit_without_type', (SELECT count(*) FROM visit_deposits WHERE type_code IS NULL OR type_code = ''),
    'positive_visit_without_property', (SELECT count(*) FROM visits WHERE has_focus = true AND property_id IS NULL)
  ));

  -- Usuários
  v := v || jsonb_build_object('users', jsonb_build_object(
    'total', (SELECT count(*) FROM profiles),
    'inactive', (SELECT count(*) FROM profiles WHERE is_active = false),
    'agents_without_supervisor', (SELECT count(*) FROM profiles WHERE role = 'agente' AND supervisor_id IS NULL),
    'supervisors_without_team', (SELECT count(*) FROM profiles s WHERE s.role = 'supervisor' AND NOT EXISTS (SELECT 1 FROM profiles a WHERE a.supervisor_id = s.id)),
    'duplicated_emails', (SELECT count(*) FROM (SELECT email FROM profiles WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1) d),
    'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', full_name, 'role', role, 'supervisor', supervisor_id, 'active', is_active
    )), '[]'::jsonb) FROM (SELECT * FROM profiles ORDER BY created_at DESC LIMIT 25) p)
  ));

  -- Ciclos
  v := v || jsonb_build_object('cycles', jsonb_build_object(
    'by_date', (SELECT to_jsonb(c) FROM cycles c WHERE today BETWEEN start_date AND end_date ORDER BY year DESC, number LIMIT 1),
    'by_status', (SELECT to_jsonb(c) FROM cycles c WHERE status = 'in_progress' ORDER BY year DESC LIMIT 1),
    'multiple_in_progress', (SELECT count(*) > 1 FROM cycles WHERE status = 'in_progress'),
    'expired_in_progress', (SELECT count(*) FROM cycles WHERE status = 'in_progress' AND end_date < today)
  ));

  RETURN v;
END;
$$;


--
-- Name: enforce_agent_supervisor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_agent_supervisor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Na criação da conta o perfil é inserido pelo trigger handle_new_user com
  -- role 'agente' e supervisor_id NULL (o vínculo é definido logo depois pelo
  -- fluxo de cadastro). Exigir supervisor já no INSERT quebrava a criação de
  -- QUALQUER usuário novo, inclusive coordenadores.
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'agente'::user_role_type AND NEW.supervisor_id IS NULL THEN
    RAISE EXCEPTION 'Agente % deve possuir supervisor_id obrigatoriamente.', COALESCE(NEW.full_name, NEW.email, NEW.id::text)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_property_geocode_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_property_geocode_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_role text;
  geo_changed boolean;
BEGIN
  geo_changed :=
    (NEW.latitude IS DISTINCT FROM OLD.latitude)
    OR (NEW.longitude IS DISTINCT FROM OLD.longitude);

  IF NOT geo_changed THEN
    RETURN NEW;
  END IF;

  caller_role := public.get_user_role(auth.uid());

  -- Agentes só podem registrar a localização quando ainda não existir.
  IF caller_role NOT IN ('admin_master','coordenador','supervisor') THEN
    IF OLD.latitude IS NOT NULL OR OLD.longitude IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas supervisor ou admin master podem corrigir a localização de um imóvel já georreferenciado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geocoded_at := COALESCE(NEW.geocoded_at, now());
    NEW.geocoded_by := COALESCE(NEW.geocoded_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: ensure_agent_for_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_agent_for_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.agents (profile_id, name, status)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.full_name, ''), NEW.email, 'Agente'), 'active')
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: ensure_annual_cycles(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_annual_cycles(target_year integer) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    i INTEGER;
    j INTEGER;
    cycle_name TEXT;
    start_date DATE;
    end_date DATE;
    new_cycle_id UUID;
    week_start DATE;
    week_end DATE;
BEGIN
    FOR i IN 1..6 LOOP
        cycle_name := 'Ciclo ' || i || ' / ' || target_year;
        
        -- Approximate dates: each cycle is ~2 months
        start_date := (target_year || '-' || ((i-1)*2 + 1) || '-01')::DATE;
        end_date := (start_date + INTERVAL '2 months' - INTERVAL '1 day')::DATE;

        INSERT INTO public.cycles (name, number, year, start_date, end_date, status)
        VALUES (cycle_name, i, target_year, start_date, end_date, 'not_started')
        ON CONFLICT (year, number) DO UPDATE 
        SET name = EXCLUDED.name,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date
        RETURNING id INTO new_cycle_id;

        -- Create 8 weeks for each cycle
        FOR j IN 1..8 LOOP
            week_start := start_date + ((j-1) * 7);
            week_end := week_start + 6;
            
            -- Ensure week doesn't exceed cycle end_date too much
            IF week_start <= end_date THEN
                INSERT INTO public.weeks (cycle_id, number, start_date, end_date)
                VALUES (new_cycle_id, j, week_start, week_end)
                ON CONFLICT (cycle_id, number) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;


--
-- Name: ensure_dwr_end_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_dwr_end_time() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.end_time IS NULL THEN
    NEW.end_time := COALESCE(NEW.updated_at, now());
    RAISE NOTICE 'ensure_dwr_end_time: end_time preenchido automaticamente para DWR %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fill_cycle_week_from_date(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_cycle_week_from_date() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE ref_date date; r record;
BEGIN
  IF TG_TABLE_NAME = 'visits' THEN
    ref_date := COALESCE(public.operational_date(NEW.visit_date), public.operational_date(now()));
  ELSIF TG_TABLE_NAME = 'daily_work_records' THEN
    ref_date := COALESCE(NEW.work_date, public.operational_date(now()));
  ELSIF TG_TABLE_NAME = 'field_work_sessions' THEN
    ref_date := COALESCE(NEW.session_date, public.operational_date(now()));
  ELSE ref_date := public.operational_date(now());
  END IF;
  IF NEW.cycle_id IS NULL OR NEW.week_id IS NULL THEN
    SELECT * INTO r FROM public.resolve_cycle_week(ref_date);
    IF FOUND THEN
      IF NEW.cycle_id IS NULL THEN NEW.cycle_id := r.cycle_id; END IF;
      IF NEW.week_id IS NULL THEN NEW.week_id := r.week_id; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fill_property_block_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_property_block_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.block_id IS NOT NULL AND (NEW.block_number IS NULL OR NEW.block_number = '') THEN
    SELECT b.number INTO NEW.block_number FROM public.blocks b WHERE b.id = NEW.block_id;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: finalize_shift_pendencies(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_shift_pendencies(p_agent_id uuid, p_cycle_id uuid, p_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_created integer := 0;
  v_recovered integer := 0;
  v_closed integer := 0;
  v_refused integer := 0;
  r record;
  v_last_status text;
  v_last_visit_id uuid;
  v_last_notes text;
  v_mapped recovery_result;
BEGIN
  FOR r IN
    SELECT DISTINCT property_id
    FROM public.visits
    WHERE agent_id = p_agent_id
      AND cycle_id = p_cycle_id
      AND public.operational_date(visit_date) = p_date
      AND property_id IS NOT NULL
  LOOP
    SELECT v.status::text, v.id, v.notes
      INTO v_last_status, v_last_visit_id, v_last_notes
    FROM public.visits v
    WHERE v.property_id = r.property_id
      AND v.agent_id = p_agent_id
      AND v.cycle_id = p_cycle_id
      AND public.operational_date(v.visit_date) = p_date
    ORDER BY v.visit_date DESC
    LIMIT 1;

    IF v_last_status = 'visited' THEN
      IF EXISTS (
        SELECT 1 FROM public.visits v2
        WHERE v2.property_id = r.property_id
          AND v2.agent_id = p_agent_id
          AND v2.cycle_id = p_cycle_id
          AND public.operational_date(v2.visit_date) = p_date
          AND v2.status::text IN ('closed','refused')
      ) THEN
        v_recovered := v_recovered + 1;
      END IF;
      CONTINUE;
    END IF;

    v_mapped := CASE v_last_status
      WHEN 'closed' THEN 'closed'::recovery_result
      WHEN 'refused' THEN 'refused'::recovery_result
      WHEN 'abandoned' THEN 'absent'::recovery_result
      ELSE NULL
    END;

    IF v_mapped IS NULL THEN CONTINUE; END IF;

    IF EXISTS (SELECT 1 FROM public.property_pendencies WHERE property_id = r.property_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.property_recovery_attempts
      (property_id, visit_id, agent_id, result, notes, attempted_at)
    VALUES
      (r.property_id, v_last_visit_id, p_agent_id, v_mapped, v_last_notes, now());

    v_created := v_created + 1;
    IF v_last_status = 'closed' THEN v_closed := v_closed + 1;
    ELSIF v_last_status = 'refused' THEN v_refused := v_refused + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pendencies_created', v_created,
    'recovered_in_day', v_recovered,
    'closed_pendencies', v_closed,
    'refused_pendencies', v_refused
  );
END $$;


--
-- Name: get_coordinator_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coordinator_data(p_user_id uuid) RETURNS TABLE(id uuid, full_name text, email text, role text, supervisor_id uuid, coordinator_id uuid, is_active boolean, city text, registration_number text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Só o próprio usuário autenticado pode consultar seus dados de escopo
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN;
  END IF;

  IF public.get_user_role(p_user_id) = 'admin_master' THEN
    RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role::text, p.supervisor_id, p.coordinator_id, p.is_active, p.city, p.registration_number
    FROM public.profiles p;
    RETURN;
  END IF;

  IF public.get_user_role(p_user_id) = 'coordenador' THEN
    RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role::text, p.supervisor_id, p.coordinator_id, p.is_active, p.city, p.registration_number
    FROM public.profiles p
    WHERE p.id = p_user_id
       OR (p.role = 'supervisor' AND (p.coordinator_id = p_user_id OR p.coordinator_id IS NULL))
       OR (
         p.role = 'agente'
         AND (
           p.supervisor_id IN (
             SELECT s.id FROM public.profiles s
             WHERE s.role = 'supervisor' AND (s.coordinator_id = p_user_id OR s.coordinator_id IS NULL)
           )
           OR p.supervisor_id IS NULL
         )
       );
    RETURN;
  END IF;

  RETURN;
END;
$$;


--
-- Name: get_correct_metrics(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_correct_metrics(p_agent_id uuid, p_cycle_id uuid, p_work_date date) RETURNS TABLE(total_properties bigint, visited_count bigint, closed_count bigint, pending_count bigint)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT work_date)::BIGINT as total_properties,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as visited_count,
    COUNT(*) FILTER (WHERE properties_closed > 0)::BIGINT as closed_count,
    COUNT(*) FILTER (WHERE status = 'pending' OR status IS NULL)::BIGINT as pending_count
  FROM daily_work_records
  WHERE agent_id = p_agent_id 
    AND cycle_id = p_cycle_id
    AND work_date <= p_work_date;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status public.cycle_status DEFAULT 'not_started'::public.cycle_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    number integer,
    year integer DEFAULT EXTRACT(year FROM now()),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: get_current_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_cycle() RETURNS public.cycles
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM public.cycles
   WHERE public.operational_date(now()) BETWEEN start_date AND end_date
   ORDER BY year DESC, number LIMIT 1
$$;


--
-- Name: get_epi_week(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_epi_week(d date) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN (SELECT extract(week from d)::integer);
END;
$$;


--
-- Name: get_operational_block_status(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_operational_block_status(_block_id uuid, _work_date date) RETURNS TABLE(block_id uuid, work_date date, total integer, visited integer, closed integer, refused integer, recovered integer, pending integer, status text, completion_percentage numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total int := 0;
  v_visited int := 0;
  v_closed int := 0;
  v_refused int := 0;
  v_recovered int := 0;
  v_done int := 0;
  v_pending int := 0;
  v_status text;
  v_pct numeric(5,2);
BEGIN
  SELECT count(*) INTO v_total FROM public.properties WHERE properties.block_id = _block_id;

  SELECT
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'visited'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused'),
    count(DISTINCT v.property_id) FILTER (WHERE v.is_recovery = true)
  INTO v_visited, v_closed, v_refused, v_recovered
  FROM public.visits v
  JOIN public.properties p ON p.id = v.property_id
  WHERE p.block_id = _block_id
    AND public.operational_date(v.visit_date) = _work_date;

  v_done := COALESCE(v_visited,0) + COALESCE(v_closed,0) + COALESCE(v_refused,0);
  v_pending := GREATEST(0, v_total - v_done);
  v_status := CASE
    WHEN v_total > 0 AND v_pending = 0 THEN 'CONCLUIDO'
    WHEN v_done > 0 THEN 'EM_ANDAMENTO'
    ELSE 'PENDENTE'
  END;
  v_pct := CASE WHEN v_total > 0 THEN ROUND((v_done::numeric / v_total) * 100, 2) ELSE 0 END;

  RETURN QUERY SELECT _block_id, _work_date, v_total, COALESCE(v_visited,0),
    COALESCE(v_closed,0), COALESCE(v_refused,0), COALESCE(v_recovered,0),
    v_pending, v_status, v_pct;
END;
$$;


--
-- Name: operational_date(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_date(ts timestamp with time zone) RETURNS date
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date;
$$;


--
-- Name: visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    cycle_id uuid NOT NULL,
    status public.visit_status NOT NULL,
    activity_type public.activity_type DEFAULT 'routine'::public.activity_type NOT NULL,
    visit_date timestamp with time zone DEFAULT now() NOT NULL,
    has_focus boolean DEFAULT false,
    sample_collected boolean DEFAULT false,
    treatment_applied boolean DEFAULT false,
    treatment_amount numeric,
    elimination_done boolean DEFAULT false,
    elimination_amount integer,
    week_number integer,
    week_id uuid,
    year integer DEFAULT EXTRACT(year FROM public.operational_date(now())),
    notes text,
    guidance_given boolean DEFAULT false,
    is_recovered boolean DEFAULT false,
    larvicide_unit text,
    treated_deposits integer DEFAULT 0,
    tubitos_coletados integer DEFAULT 0,
    field_work_session_id uuid,
    block_id uuid
);


--
-- Name: COLUMN visits.tubitos_coletados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.visits.tubitos_coletados IS 'Number of collected sample tubes during the visit';


--
-- Name: get_session_visits(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_session_visits(_agent_id uuid, _session_date date) RETURNS SETOF public.visits
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT *
    FROM public.visits
   WHERE agent_id = _agent_id
     AND public.operational_date(visit_date) = _session_date;
$$;


--
-- Name: FUNCTION get_session_visits(_agent_id uuid, _session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_session_visits(_agent_id uuid, _session_date date) IS 'Retorna todas as visitas do agente cuja data operacional (America/Sao_Paulo) é igual à data da jornada. Fonte canônica usada por Tela de Trabalho, DWR, Boletim, Dashboard e Relatórios.';


--
-- Name: get_user_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role(u_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT ur.role::text
  FROM public.user_roles ur
  WHERE ur.user_id = u_id
  ORDER BY CASE ur.role::text
    WHEN 'admin_master' THEN 1
    WHEN 'coordenador' THEN 2
    WHEN 'supervisor' THEN 3
    WHEN 'agente' THEN 4
    WHEN 'admin' THEN 5
    WHEN 'agent' THEN 6
    ELSE 99
  END
  LIMIT 1;
$$;


--
-- Name: handle_cycle_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_cycle_transition() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    next_cycle_number INTEGER;
    next_year INTEGER;
BEGIN
    -- Only trigger when status changes to 'finished'
    IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
        
        -- Identify next cycle
        IF NEW.number < 6 THEN
            next_cycle_number := NEW.number + 1;
            next_year := NEW.year;
        ELSE
            next_cycle_number := 1;
            next_year := NEW.year + 1;
            -- Ensure cycles for the next year exist
            PERFORM public.ensure_annual_cycles(next_year);
        END IF;

        -- Start next cycle
        UPDATE public.cycles 
        SET status = 'in_progress'
        WHERE year = next_year AND number = next_cycle_number;

        -- Ensure only one cycle is 'in_progress' for the current/next year
        -- (Optional: but the requirement says "Somente 1 ciclo por ano pode estar em andamento")
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    'agente'::user_role_type
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: health_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.health_check() RETURNS TABLE(status text, database_active boolean, keep_alive_recorded boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_insert_id UUID;
BEGIN
  INSERT INTO supabase_keep_alive (ping_source, status, response_time_ms)
  VALUES ('manual', 'success', 0)
  RETURNING id INTO v_insert_id;
  
  RETURN QUERY
  SELECT 
    'ok'::TEXT as status,
    TRUE as database_active,
    (v_insert_id IS NOT NULL)::BOOLEAN as keep_alive_recorded;
END;
$$;


--
-- Name: log_activity(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_activity(source_type text) RETURNS TABLE(logged boolean, message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO supabase_keep_alive (ping_source, status, response_time_ms)
  VALUES (source_type, 'success', 0)
  RETURNING id INTO v_id;
  
  RETURN QUERY
  SELECT 
    (v_id IS NOT NULL)::BOOLEAN as logged,
    format('✅ Atividade registrada: %s', source_type)::TEXT as message;
END;
$$;


--
-- Name: on_recovery_attempt_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_recovery_attempt_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_resolution boolean;
  next_attempt integer;
BEGIN
  is_resolution := NEW.result IN ('visited','unoccupied','demolished');

  -- Compute attempt_number if 1 (default)
  SELECT COALESCE(MAX(attempt_number),0) + 1 INTO next_attempt
  FROM public.property_recovery_attempts
  WHERE property_id = NEW.property_id AND id <> NEW.id;
  UPDATE public.property_recovery_attempts SET attempt_number = next_attempt WHERE id = NEW.id;

  -- Upsert pendency
  INSERT INTO public.property_pendencies (property_id, agent_id, current_status, reason, attempt_count, last_attempt_at, resolved_at, resolved_status)
  VALUES (
    NEW.property_id, NEW.agent_id, NEW.result, NEW.notes, next_attempt, NEW.attempted_at,
    CASE WHEN is_resolution THEN NEW.attempted_at ELSE NULL END,
    CASE WHEN is_resolution THEN NEW.result ELSE NULL END
  )
  ON CONFLICT (property_id) DO UPDATE SET
    agent_id = EXCLUDED.agent_id,
    current_status = EXCLUDED.current_status,
    reason = EXCLUDED.reason,
    attempt_count = next_attempt,
    last_attempt_at = EXCLUDED.last_attempt_at,
    resolved_at = CASE WHEN is_resolution THEN EXCLUDED.last_attempt_at ELSE NULL END,
    resolved_status = CASE WHEN is_resolution THEN EXCLUDED.current_status ELSE NULL END,
    updated_at = now();

  -- Update property.status when applicable
  IF NEW.result IN ('unoccupied','demolished','visited') THEN
    UPDATE public.properties SET status = NEW.result::text::property_status WHERE id = NEW.property_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES ('recovery_attempt', 'property', NEW.agent_id, NEW.property_id,
    jsonb_build_object('result', NEW.result, 'attempt_number', next_attempt, 'notes', NEW.notes));

  RETURN NEW;
END $$;


--
-- Name: on_visit_create_recovery_attempt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_visit_create_recovery_attempt() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  mapped_result public.recovery_result;
  has_pendency boolean;
BEGIN
  mapped_result := CASE NEW.status::text
    WHEN 'closed' THEN 'closed'::recovery_result
    WHEN 'refused' THEN 'refused'::recovery_result
    WHEN 'abandoned' THEN 'absent'::recovery_result
    WHEN 'visited' THEN 'visited'::recovery_result
    ELSE NULL
  END;

  IF mapped_result IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.property_pendencies
    WHERE property_id = NEW.property_id
  ) INTO has_pendency;

  -- Nova regra: pendências só nascem ao encerrar o expediente (finalize_shift_pendencies).
  -- Trigger registra tentativa SOMENTE quando já existe pendência prévia (follow-up).
  IF NOT has_pendency THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.property_recovery_attempts (property_id, visit_id, agent_id, result, notes, attempted_at)
  VALUES (NEW.property_id, NEW.id, NEW.agent_id, mapped_result, NEW.notes, NEW.visit_date);

  RETURN NEW;
END $$;


--
-- Name: on_visit_upsert_update_block(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_visit_upsert_update_block() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    v_block_id UUID;
BEGIN
    SELECT block_id INTO v_block_id FROM public.properties WHERE id = NEW.property_id;
    IF v_block_id IS NOT NULL AND NEW.cycle_id IS NOT NULL THEN
        PERFORM public.check_block_completion(v_block_id, NEW.cycle_id);
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: populate_daily_epi_week(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_daily_epi_week() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.work_date IS NOT NULL THEN
    NEW.epi_week := EXTRACT(week FROM NEW.work_date)::integer;
    NEW.epi_year := EXTRACT(isoyear FROM NEW.work_date)::integer;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: populate_visit_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_visit_metadata() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NEW.cycle_id IS NOT NULL THEN
        SELECT year INTO NEW.year FROM public.cycles WHERE id = NEW.cycle_id;
    END IF;

    IF NEW.year IS NULL THEN
        NEW.year := EXTRACT(YEAR FROM COALESCE(public.operational_date(NEW.visit_date), public.operational_date(now())));
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: rebuild_daily_work_records(date, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebuild_daily_work_records(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _agent uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rebuilt int := 0;
  v_corrected int := 0;
  v_days int := 0;
  r record;
  v_cycle_id uuid;
  v_week_id uuid;
  v_epi_week int;
  v_epi_year int;
  v_existing record;
  v_today date := public.operational_date(now());
BEGIN
  RAISE NOTICE '[DWR_REBUILD_START] from=% to=% agent=% tz=America/Sao_Paulo', _from, _to, _agent;

  FOR r IN
    SELECT
      v.agent_id                                              AS agent_id,
      public.operational_date(v.visit_date)                   AS work_date,
      count(DISTINCT v.property_id)                                                                     AS worked,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed')                            AS closed,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused')                           AS refused,
      count(DISTINCT v.property_id) FILTER (WHERE v.has_focus = true)                                   AS positive,
      COALESCE(sum(v.tubitos_coletados), 0)                                                             AS tubitos,
      COALESCE(sum(v.treatment_amount), 0)                                                              AS larvicide,
      min(v.visit_date)                                                                                 AS start_ts,
      max(v.visit_date)                                                                                 AS end_ts
    FROM public.visits v
    WHERE v.agent_id IS NOT NULL
      AND v.visit_date IS NOT NULL
      AND (_from  IS NULL OR public.operational_date(v.visit_date) >= _from)
      AND (_to    IS NULL OR public.operational_date(v.visit_date) <= _to)
      AND (_agent IS NULL OR v.agent_id = _agent)
    GROUP BY v.agent_id, public.operational_date(v.visit_date)
  LOOP
    v_days := v_days + 1;

    RAISE NOTICE '[DWR_GROUPING] date=% agent=% visits=% tz=America/Sao_Paulo', r.work_date, r.agent_id, r.worked;

    SELECT cycle_id, week_id INTO v_cycle_id, v_week_id
    FROM public.resolve_cycle_week(r.work_date);

    v_epi_week := EXTRACT(week    FROM r.work_date)::int;
    v_epi_year := EXTRACT(isoyear FROM r.work_date)::int;

    SELECT id, properties_worked, properties_closed, properties_refused,
           properties_positive, tubitos_collected, larvicide_amount, positive_foci
      INTO v_existing
      FROM public.daily_work_records
     WHERE legacy_agent_id = r.agent_id
       AND work_date = r.work_date;

    IF FOUND THEN
      IF v_existing.properties_worked  IS DISTINCT FROM r.worked
      OR v_existing.properties_closed  IS DISTINCT FROM r.closed
      OR v_existing.properties_refused IS DISTINCT FROM r.refused
      OR v_existing.properties_positive IS DISTINCT FROM r.positive
      OR v_existing.tubitos_collected  IS DISTINCT FROM r.tubitos
      OR v_existing.larvicide_amount   IS DISTINCT FROM r.larvicide
      OR v_existing.positive_foci      IS DISTINCT FROM r.positive
      THEN
        UPDATE public.daily_work_records
           SET properties_worked   = r.worked,
               properties_closed   = r.closed,
               properties_refused  = r.refused,
               properties_positive = r.positive,
               positive_foci       = r.positive,
               tubitos_collected   = r.tubitos,
               larvicide_amount    = r.larvicide,
               cycle_id            = COALESCE(v_cycle_id, cycle_id),
               week_id             = COALESCE(v_week_id, week_id),
               epi_week            = v_epi_week,
               epi_year            = v_epi_year,
               data_integrity_log  = COALESCE(data_integrity_log, '{}'::jsonb)
                                     || jsonb_build_object(
                                          'rebuild', jsonb_build_object(
                                            'at', now(),
                                            'tz', 'America/Sao_Paulo',
                                            'source', 'rebuild_daily_work_records'
                                          )
                                        ),
               updated_at          = now()
         WHERE id = v_existing.id;
        v_corrected := v_corrected + 1;
      END IF;
    ELSE
      INSERT INTO public.daily_work_records (
        agent_id, legacy_agent_id, cycle_id, week_id, work_date,
        status, start_time, end_time, is_retroactive,
        properties_worked, properties_closed, properties_refused, properties_positive,
        tubitos_collected, larvicide_amount, positive_foci,
        epi_week, epi_year, data_integrity_log
      ) VALUES (
        r.agent_id, r.agent_id, v_cycle_id, v_week_id, r.work_date,
        'completed', r.start_ts, r.end_ts, (r.work_date < v_today),
        r.worked, r.closed, r.refused, r.positive,
        r.tubitos, r.larvicide, r.positive,
        v_epi_week, v_epi_year,
        jsonb_build_object('rebuild', jsonb_build_object(
          'at', now(), 'tz', 'America/Sao_Paulo', 'source', 'rebuild_daily_work_records'
        ))
      )
      ON CONFLICT (legacy_agent_id, work_date) DO NOTHING;
      v_rebuilt := v_rebuilt + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '[DWR_REBUILD_FINISH] days=% rebuilt=% corrected=%', v_days, v_rebuilt, v_corrected;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('rebuild_daily_work_records', 'system', auth.uid(),
          jsonb_build_object('from', _from, 'to', _to, 'agent', _agent,
                             'days', v_days, 'rebuilt', v_rebuilt, 'corrected', v_corrected,
                             'tz', 'America/Sao_Paulo'));

  RETURN jsonb_build_object(
    'days', v_days,
    'rebuilt', v_rebuilt,
    'corrected', v_corrected,
    'tz', 'America/Sao_Paulo'
  );
END;
$$;


--
-- Name: rebuild_dwr_after_session_close(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebuild_dwr_after_session_close() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Só consolida na transição efetiva para encerrada. INSERT já fechado também
  -- é aceito para cobrir sincronizações/replays offline.
  IF NEW.status::text = 'closed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    v_result := public.rebuild_daily_work_records(
      NEW.session_date,
      NEW.session_date,
      NEW.user_id
    );

    RAISE NOTICE '[DWR_AUTO_REBUILD_SESSION_CLOSE] session=% user=% date=% result=%',
      NEW.id, NEW.user_id, NEW.session_date, v_result;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- O encerramento da jornada não deve ser perdido por uma falha de
    -- consolidação. Registra o erro no log do Postgres; a reconstrução pode ser
    -- repetida com segurança depois.
    RAISE WARNING '[DWR_AUTO_REBUILD_FAILED] session=% user=% date=% error=%',
      NEW.id, NEW.user_id, NEW.session_date, SQLERRM;
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION rebuild_dwr_after_session_close(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rebuild_dwr_after_session_close() IS 'Consolida daily_work_records automaticamente quando uma jornada é encerrada, inclusive após sincronização offline.';


--
-- Name: block_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.block_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    block_number text NOT NULL,
    agent_id uuid NOT NULL,
    status text DEFAULT 'NOT_STARTED'::text NOT NULL,
    completion_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    total_properties integer DEFAULT 0 NOT NULL,
    visited_properties integer DEFAULT 0 NOT NULL,
    pending_properties integer DEFAULT 0 NOT NULL,
    closed_properties integer DEFAULT 0 NOT NULL,
    recovered_properties integer DEFAULT 0 NOT NULL,
    positive_focus integer DEFAULT 0 NOT NULL,
    negative_focus integer DEFAULT 0 NOT NULL,
    tb_properties integer DEFAULT 0 NOT NULL,
    pe_properties integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_visit_at timestamp with time zone,
    last_operational_date date,
    last_sync timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT block_progress_status_check CHECK ((status = ANY (ARRAY['NOT_STARTED'::text, 'IN_PROGRESS'::text, 'PAUSED'::text, 'COMPLETED'::text])))
);


--
-- Name: recompute_block_progress(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_block_progress(_cycle_id uuid, _block_number text, _agent_id uuid) RETURNS public.block_progress
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total int := 0;
  v_visited int := 0;
  v_closed int := 0;
  v_refused int := 0;
  v_recovered int := 0;
  v_positive int := 0;
  v_pending int := 0;
  v_last_visit timestamptz;
  v_last_op_date date;
  v_started timestamptz;
  v_status text;
  v_pct numeric(5,2);
  v_row public.block_progress;
  v_block_ids uuid[];
BEGIN
  IF _cycle_id IS NULL OR _block_number IS NULL OR _agent_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve possible block UUIDs matching the number (properties may reference block_id only)
  SELECT array_agg(id) INTO v_block_ids
    FROM public.blocks WHERE number::text = _block_number;

  SELECT count(*) INTO v_total
    FROM public.properties p
   WHERE p.block_number = _block_number
      OR (v_block_ids IS NOT NULL AND p.block_id = ANY(v_block_ids));

  SELECT
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'visited'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed'),
    count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused'),
    count(DISTINCT v.property_id) FILTER (WHERE v.is_recovered = true),
    count(DISTINCT v.property_id) FILTER (WHERE v.has_focus = true),
    max(v.visit_date),
    max(public.operational_date(v.visit_date)),
    min(v.visit_date)
  INTO v_visited, v_closed, v_refused, v_recovered, v_positive,
       v_last_visit, v_last_op_date, v_started
  FROM public.visits v
  JOIN public.properties p ON p.id = v.property_id
  WHERE (p.block_number = _block_number
         OR (v_block_ids IS NOT NULL AND p.block_id = ANY(v_block_ids)))
    AND v.agent_id = _agent_id
    AND v.cycle_id = _cycle_id;

  v_pending := GREATEST(0, v_total - (COALESCE(v_visited,0) + COALESCE(v_closed,0) + COALESCE(v_refused,0)));
  v_pct := CASE WHEN v_total > 0
    THEN ROUND(((COALESCE(v_visited,0)+COALESCE(v_closed,0)+COALESCE(v_refused,0))::numeric / v_total) * 100, 2)
    ELSE 0 END;

  v_status := CASE
    WHEN v_total > 0 AND v_pending = 0 THEN 'COMPLETED'
    WHEN v_last_visit IS NOT NULL THEN 'IN_PROGRESS'
    ELSE 'NOT_STARTED'
  END;

  INSERT INTO public.block_progress (
    cycle_id, block_number, agent_id, status, completion_percentage,
    total_properties, visited_properties, pending_properties, closed_properties,
    recovered_properties, positive_focus, negative_focus, tb_properties, pe_properties,
    started_at, completed_at, last_visit_at, last_operational_date, last_sync
  ) VALUES (
    _cycle_id, _block_number, _agent_id, v_status, v_pct,
    v_total, COALESCE(v_visited,0), v_pending, COALESCE(v_closed,0),
    COALESCE(v_recovered,0), COALESCE(v_positive,0), 0, 0, 0,
    v_started, CASE WHEN v_status='COMPLETED' THEN now() ELSE NULL END,
    v_last_visit, v_last_op_date, now()
  )
  ON CONFLICT (cycle_id, block_number, agent_id) DO UPDATE SET
    status = EXCLUDED.status,
    completion_percentage = EXCLUDED.completion_percentage,
    total_properties = EXCLUDED.total_properties,
    visited_properties = EXCLUDED.visited_properties,
    pending_properties = EXCLUDED.pending_properties,
    closed_properties = EXCLUDED.closed_properties,
    recovered_properties = EXCLUDED.recovered_properties,
    positive_focus = EXCLUDED.positive_focus,
    started_at = COALESCE(public.block_progress.started_at, EXCLUDED.started_at),
    completed_at = CASE WHEN EXCLUDED.status='COMPLETED'
                        THEN COALESCE(public.block_progress.completed_at, now())
                        ELSE NULL END,
    last_visit_at = EXCLUDED.last_visit_at,
    last_operational_date = EXCLUDED.last_operational_date,
    last_sync = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;


--
-- Name: reconcile_rg_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconcile_rg_integrity() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_blocks_linked int := 0;
  v_blocks_created int := 0;
  v_properties_linked int := 0;
  v_orphans_removed int := 0;
  v_subarea uuid;
  r record;
  v_block_id uuid;
  v_loc text;
BEGIN
  SELECT id INTO v_subarea FROM public.subareas LIMIT 1;

  FOR r IN
    SELECT id, block_number, locality, agent_id
      FROM public.boletins_rg
     WHERE block_id IS NULL AND block_number IS NOT NULL
  LOOP
    v_loc := COALESCE(NULLIF(trim(r.locality), ''), 'sem-localidade');

    SELECT id INTO v_block_id
      FROM public.blocks
     WHERE lower(trim(COALESCE(locality, 'sem-localidade'))) = lower(v_loc)
       AND number = r.block_number
     LIMIT 1;

    IF v_block_id IS NULL THEN
      INSERT INTO public.blocks (number, total_properties, status, subarea_id, locality)
      VALUES (r.block_number, 0, 'not_started'::public.block_status, v_subarea, v_loc)
      RETURNING id INTO v_block_id;
      v_blocks_created := v_blocks_created + 1;
    END IF;

    UPDATE public.boletins_rg SET block_id = v_block_id WHERE id = r.id;
    v_blocks_linked := v_blocks_linked + 1;
  END LOOP;

  WITH cand AS (
    SELECT p.id AS prop_id, b.id AS boletim_id
      FROM public.properties p
      JOIN public.boletins_rg b ON b.block_id = p.block_id
     WHERE p.boletim_id IS NULL
       AND p.block_id IS NOT NULL
       AND (b.agent_id IS NULL OR p.user_id IS NULL OR b.agent_id = p.user_id)
  ),
  uniq AS (
    SELECT prop_id, (array_agg(boletim_id))[1] AS boletim_id
      FROM cand
     GROUP BY prop_id
    HAVING count(DISTINCT boletim_id) = 1
  )
  UPDATE public.properties p
     SET boletim_id = u.boletim_id
    FROM uniq u
   WHERE p.id = u.prop_id;
  GET DIAGNOSTICS v_properties_linked = ROW_COUNT;

  WITH del AS (
    DELETE FROM public.blocks b
     WHERE NOT EXISTS (SELECT 1 FROM public.boletins_rg br WHERE br.block_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM public.properties pr WHERE pr.block_id = b.id)
       AND COALESCE(b.total_properties, 0) = 0
    RETURNING 1
  )
  SELECT count(*) INTO v_orphans_removed FROM del;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('reconcile_rg_integrity', 'system', auth.uid(),
          jsonb_build_object(
            'blocks_linked', v_blocks_linked,
            'blocks_created', v_blocks_created,
            'properties_linked', v_properties_linked,
            'orphans_removed', v_orphans_removed
          ));

  RETURN jsonb_build_object(
    'blocks_linked', v_blocks_linked,
    'blocks_created', v_blocks_created,
    'properties_linked', v_properties_linked,
    'orphans_removed', v_orphans_removed
  );
END;
$$;


--
-- Name: record_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO supabase_keep_alive (ping_source, status, response_time_ms)
  VALUES ('app', 'success', 0);
  RETURN NEW;
END;
$$;


--
-- Name: recover_session_visits(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recover_session_visits(_session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  s RECORD;
  v_updated int := 0;
  v_dwr_exists boolean;
  v_dwr_generated boolean := false;
  v_agg RECORD;
BEGIN
  SELECT id, user_id, session_date, cycle_id, week_id, block_number
    INTO s
    FROM public.field_work_sessions
   WHERE id = _session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  WITH candidates AS (
    SELECT v.id
      FROM public.visits v
      JOIN public.properties p ON p.id = v.property_id
     WHERE v.agent_id = s.user_id
       AND public.operational_date(v.visit_date) = s.session_date
       AND p.block_number = s.block_number
       AND (
         v.field_work_session_id IS DISTINCT FROM _session_id
         OR v.cycle_id IS DISTINCT FROM s.cycle_id
         OR v.week_id IS DISTINCT FROM s.week_id
       )
  )
  SELECT count(*) INTO v_updated FROM candidates;

  IF v_updated > 0 THEN
    UPDATE public.visits v
       SET field_work_session_id = _session_id,
           cycle_id = s.cycle_id,
           week_id  = COALESCE(s.week_id, v.week_id),
           updated_at = now()
      FROM public.properties p
     WHERE v.property_id = p.id
       AND v.agent_id = s.user_id
       AND public.operational_date(v.visit_date) = s.session_date
       AND p.block_number = s.block_number
       AND (
         v.field_work_session_id IS DISTINCT FROM _session_id
         OR v.cycle_id IS DISTINCT FROM s.cycle_id
         OR v.week_id IS DISTINCT FROM s.week_id
       );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.daily_work_records
     WHERE agent_id = s.user_id AND work_date = s.session_date
  ) INTO v_dwr_exists;

  IF NOT v_dwr_exists THEN
    SELECT
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'visited')  AS worked,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'closed')   AS closed,
      count(DISTINCT v.property_id) FILTER (WHERE v.status::text = 'refused')  AS refused,
      count(DISTINCT v.property_id) FILTER (WHERE v.has_focus = true)          AS positive,
      COALESCE(sum(v.tubitos_coletados), 0)                                    AS tubitos,
      COALESCE(sum(v.treatment_amount), 0)                                     AS larvicide
    INTO v_agg
    FROM public.visits v
    WHERE v.agent_id = s.user_id
      AND public.operational_date(v.visit_date) = s.session_date
      AND v.field_work_session_id = _session_id;

    INSERT INTO public.daily_work_records (
      agent_id, legacy_agent_id, cycle_id, week_id, work_date,
      status, is_retroactive,
      properties_worked, properties_closed, properties_refused, properties_positive,
      tubitos_collected, larvicide_amount,
      epi_week, epi_year
    ) VALUES (
      s.user_id, s.user_id, s.cycle_id, s.week_id, s.session_date,
      'completed', (s.session_date < public.operational_date(now())),
      COALESCE(v_agg.worked, 0), COALESCE(v_agg.closed, 0),
      COALESCE(v_agg.refused, 0), COALESCE(v_agg.positive, 0),
      COALESCE(v_agg.tubitos, 0), COALESCE(v_agg.larvicide, 0),
      EXTRACT(week FROM s.session_date)::int,
      EXTRACT(isoyear FROM s.session_date)::int
    )
    ON CONFLICT (legacy_agent_id, work_date) DO NOTHING;

    v_dwr_generated := true;

    PERFORM public.finalize_shift_pendencies(s.user_id, s.cycle_id, s.session_date);
  END IF;

  IF v_updated = 0 AND NOT v_dwr_generated THEN
    RETURN jsonb_build_object('status','not_needed');
  END IF;

  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES ('session_auto_recover','field_work_sessions', s.user_id, s.id,
    jsonb_build_object(
      'updated', v_updated,
      'dwr_generated', v_dwr_generated,
      'session_date', s.session_date,
      'timezone', 'America/Sao_Paulo'
    ));

  RETURN jsonb_build_object(
    'status','recovered',
    'updated', v_updated,
    'dwr_generated', v_dwr_generated
  );
END;
$$;


--
-- Name: regenerate_cycle_weeks(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.regenerate_cycle_weeks(_cycle_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE c RECORD; i INT; total_days INT; base_len INT; remainder INT;
  cur_start DATE; cur_end DATE; len INT;
BEGIN
  SELECT id, start_date, end_date INTO c FROM public.cycles WHERE id = _cycle_id;
  IF NOT FOUND THEN RETURN; END IF;
  total_days := (c.end_date - c.start_date) + 1;
  base_len := total_days / 8;
  remainder := total_days - (base_len * 8);
  cur_start := c.start_date;
  FOR i IN 1..8 LOOP
    len := base_len + CASE WHEN i <= remainder THEN 1 ELSE 0 END;
    cur_end := cur_start + (len - 1);
    UPDATE public.weeks SET start_date = cur_start, end_date = cur_end, updated_at = now()
     WHERE cycle_id = c.id AND number = i;
    IF NOT FOUND THEN
      INSERT INTO public.weeks (cycle_id, number, start_date, end_date)
      VALUES (c.id, i, cur_start, cur_end);
    END IF;
    cur_start := cur_end + 1;
  END LOOP;
  DELETE FROM public.weeks WHERE cycle_id = c.id AND number > 8;
END $$;


--
-- Name: resolve_cycle_week(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_cycle_week(_date date) RETURNS TABLE(cycle_id uuid, week_id uuid, week_number integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT w.cycle_id, w.id, w.number
    FROM public.weeks w
    JOIN public.cycles c ON c.id = w.cycle_id
   WHERE _date BETWEEN w.start_date AND w.end_date
     AND _date BETWEEN c.start_date AND c.end_date
   ORDER BY c.year DESC, c.number, w.number
   LIMIT 1
$$;


--
-- Name: rg_integrity_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rg_integrity_check() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_bol_no_block jsonb;
  v_prop_no_bol jsonb;
  v_prop_block_mismatch jsonb;
  v_dup_blocks jsonb;
  v_count_divergence jsonb;
  v_ok boolean;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'block_number', block_number, 'locality', locality)), '[]'::jsonb)
    INTO v_bol_no_block
    FROM public.boletins_rg WHERE block_id IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'block_id', block_id, 'block_number', block_number)), '[]'::jsonb)
    INTO v_prop_no_bol
    FROM public.properties WHERE boletim_id IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('property_id', p.id, 'boletim_id', p.boletim_id, 'prop_block_id', p.block_id, 'boletim_block_id', b.block_id)), '[]'::jsonb)
    INTO v_prop_block_mismatch
    FROM public.properties p
    JOIN public.boletins_rg b ON b.id = p.boletim_id
   WHERE p.block_id IS DISTINCT FROM b.block_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('number', number, 'locality', locality, 'count', cnt)), '[]'::jsonb)
    INTO v_dup_blocks
    FROM (
      SELECT number, COALESCE(locality, 'sem-localidade') AS locality, count(*) AS cnt
        FROM public.blocks
       GROUP BY number, COALESCE(locality, 'sem-localidade')
      HAVING count(*) > 1
    ) d;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'boletim_id', b.id, 'block_number', b.block_number,
           'card_count', (SELECT count(*) FROM public.properties pp WHERE pp.boletim_id = b.id),
           'detail_count', (SELECT count(*) FROM public.properties pd WHERE pd.boletim_id = b.id)
         )), '[]'::jsonb)
    INTO v_count_divergence
    FROM public.boletins_rg b
   WHERE (SELECT count(*) FROM public.properties pp WHERE pp.boletim_id = b.id)
      <> (SELECT count(*) FROM public.properties pd WHERE pd.boletim_id = b.id);

  v_ok := jsonb_array_length(v_bol_no_block) = 0
      AND jsonb_array_length(v_prop_block_mismatch) = 0
      AND jsonb_array_length(v_dup_blocks) = 0
      AND jsonb_array_length(v_count_divergence) = 0;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_ok THEN 'OK' ELSE 'FAIL' END,
    'boletins_sem_block', v_bol_no_block,
    'properties_sem_boletim', v_prop_no_bol,
    'properties_block_divergente', v_prop_block_mismatch,
    'blocks_duplicados', v_dup_blocks,
    'divergencia_card_detalhe', v_count_divergence
  );
END;
$$;


--
-- Name: save_data_audit_snapshot(integer, jsonb, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_data_audit_snapshot(_score integer, _module_scores jsonb, _alerts_count integer DEFAULT 0, _actions_count integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_report jsonb;
BEGIN
  v_report := public.data_audit_report();
  INSERT INTO public.data_audit_snapshots
    (score, alerts_count, actions_count, module_scores, report, user_id)
  VALUES
    (_score, _alerts_count, _actions_count, _module_scores, v_report, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: set_dwr_epi_week(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_dwr_epi_week() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  iso_week int;
  iso_year int;
BEGIN
  iso_week := EXTRACT(ISOYEAR FROM NEW.work_date)::int; -- placeholder, overwritten below
  iso_week := EXTRACT(WEEK   FROM NEW.work_date)::int;
  iso_year := EXTRACT(ISOYEAR FROM NEW.work_date)::int;
  IF NEW.epi_week IS NULL THEN NEW.epi_week := iso_week; END IF;
  IF NEW.epi_year IS NULL THEN NEW.epi_year := iso_year; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_cycle_statuses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_cycle_statuses() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today date := public.operational_date(now());
  v_finished int := 0;
  v_activated int := 0;
  r record;
BEGIN
  UPDATE public.cycles SET status = 'finished'
   WHERE end_date < v_today AND status <> 'finished';
  GET DIAGNOSTICS v_finished = ROW_COUNT;

  FOR r IN
    SELECT DISTINCT ON (year) id, year FROM public.cycles
     WHERE v_today BETWEEN start_date AND end_date
     ORDER BY year, number
  LOOP
    UPDATE public.cycles SET status = 'not_started'
     WHERE year = r.year AND id <> r.id AND status = 'in_progress';
    UPDATE public.cycles SET status = 'in_progress'
     WHERE id = r.id AND status <> 'in_progress';
    IF FOUND THEN v_activated := v_activated + 1; END IF;
  END LOOP;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('sync_cycle_statuses', 'system', auth.uid(),
          jsonb_build_object('finished', v_finished, 'activated', v_activated, 'date', v_today));

  RETURN jsonb_build_object('finished', v_finished, 'activated', v_activated, 'date', v_today);
END;
$$;


--
-- Name: sync_property_block(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_property_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_block_id uuid;
  v_subarea_id uuid;
  v_locality text;
BEGIN
  IF NEW.block_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.boletim_id IS NOT NULL THEN
    SELECT block_id INTO v_block_id
    FROM public.boletins_rg
    WHERE id = NEW.boletim_id;

    IF v_block_id IS NOT NULL THEN
      NEW.block_id := v_block_id;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.block_number IS NOT NULL THEN
    SELECT id INTO v_subarea_id FROM public.subareas LIMIT 1;

    IF NEW.boletim_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(locality), ''), 'sem-localidade')
        INTO v_locality
      FROM public.boletins_rg
      WHERE id = NEW.boletim_id;
    END IF;

    v_locality := COALESCE(v_locality, 'sem-localidade');

    SELECT id INTO v_block_id
    FROM public.blocks
    WHERE lower(trim(coalesce(locality, 'sem-localidade'))) = lower(trim(v_locality))
      AND number = NEW.block_number
    LIMIT 1;

    IF v_block_id IS NULL THEN
      INSERT INTO public.blocks (number, total_properties, status, subarea_id, locality)
      VALUES (NEW.block_number, 0, 'not_started'::public.block_status, v_subarea_id, v_locality)
      RETURNING id INTO v_block_id;
    END IF;

    NEW.block_id := v_block_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_cycle_generate_weeks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cycle_generate_weeks() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN PERFORM public.regenerate_cycle_weeks(NEW.id); RETURN NEW; END $$;


--
-- Name: trg_visits_recompute_block_progress(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_visits_recompute_block_progress() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_block_number text;
  v_target_property uuid;
  v_agent uuid;
  v_cycle uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_property := OLD.property_id;
    v_agent := OLD.agent_id;
    v_cycle := OLD.cycle_id;
  ELSE
    v_target_property := NEW.property_id;
    v_agent := NEW.agent_id;
    v_cycle := NEW.cycle_id;
  END IF;

  IF v_target_property IS NULL OR v_agent IS NULL OR v_cycle IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT block_number INTO v_block_number FROM public.properties WHERE id = v_target_property;
  IF v_block_number IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.recompute_block_progress(v_cycle, v_block_number, v_agent);

  -- Handle agent/block change on UPDATE (recompute old key too)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.agent_id IS DISTINCT FROM NEW.agent_id
       OR OLD.cycle_id IS DISTINCT FROM NEW.cycle_id
       OR OLD.property_id IS DISTINCT FROM NEW.property_id THEN
      DECLARE
        v_old_block text;
      BEGIN
        SELECT block_number INTO v_old_block FROM public.properties WHERE id = OLD.property_id;
        IF v_old_block IS NOT NULL AND OLD.agent_id IS NOT NULL AND OLD.cycle_id IS NOT NULL THEN
          PERFORM public.recompute_block_progress(OLD.cycle_id, v_old_block, OLD.agent_id);
        END IF;
      END;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;


--
-- Name: update_block_property_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_block_property_count() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.block_id IS NOT NULL THEN
            UPDATE public.blocks 
            SET total_properties = (SELECT COUNT(*) FROM public.properties WHERE block_id = NEW.block_id)
            WHERE id = NEW.block_id;
        END IF;
    END IF;
    
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.block_id IS NOT NULL THEN
            UPDATE public.blocks 
            SET total_properties = (SELECT COUNT(*) FROM public.properties WHERE block_id = OLD.block_id)
            WHERE id = OLD.block_id;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: validate_boletim_agent_block(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_boletim_agent_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_role text;
  foreign_count integer;
  v_locality text := COALESCE(NULLIF(trim(NEW.locality),''),'sem-localidade');
BEGIN
  caller_role := public.get_user_role(auth.uid());
  IF caller_role IN ('admin_master','coordenador','supervisor') THEN
    RETURN NEW;
  END IF;

  IF NEW.block_number IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO foreign_count
  FROM public.boletins_rg b
  WHERE b.block_number = NEW.block_number
    AND lower(trim(coalesce(b.locality,'sem-localidade'))) = lower(trim(v_locality))
    AND b.agent_id IS NOT NULL
    AND b.agent_id <> NEW.agent_id
    AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Quarteirão % na localidade % já está vinculado a outro agente.', NEW.block_number, v_locality
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_end_session(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_end_session(p_agent_id uuid, p_cycle_id uuid, p_work_date date) RETURNS TABLE(can_end_session boolean, message text, total_days_worked bigint, last_record_date date)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE::BOOLEAN as can_end_session,
    'Encerramento autorizado. Métricas validadas.'::TEXT as message,
    COUNT(DISTINCT work_date)::BIGINT as total_days_worked,
    MAX(work_date)::DATE as last_record_date
  FROM daily_work_records
  WHERE agent_id = p_agent_id 
    AND cycle_id = p_cycle_id
    AND work_date <= p_work_date;
END;
$$;


--
-- Name: validate_field_work_session_block(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_field_work_session_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_role text;
  foreign_count integer;
BEGIN
  -- Bypass para perfis elevados
  caller_role := public.get_user_role(auth.uid());
  IF caller_role IN ('admin_master','coordenador','supervisor') THEN
    RETURN NEW;
  END IF;

  -- Conta imóveis do quarteirão vinculados a boletins de OUTROS agentes
  SELECT count(*) INTO foreign_count
  FROM public.properties p
  JOIN public.boletins_rg b ON b.id = p.boletim_id
  WHERE p.block_number = NEW.block_number
    AND b.agent_id IS NOT NULL
    AND b.agent_id <> NEW.user_id;

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Quarteirão % pertence a outro agente e não pode ser associado.', NEW.block_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_property_block_ownership(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_property_block_ownership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_role text;
  new_agent uuid;
  v_locality text;
  foreign_count integer;
BEGIN
  caller_role := public.get_user_role(auth.uid());
  IF caller_role IN ('admin_master','coordenador','supervisor') THEN
    RETURN NEW;
  END IF;

  IF NEW.boletim_id IS NULL OR NEW.block_number IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT agent_id, COALESCE(NULLIF(trim(locality),''),'sem-localidade')
    INTO new_agent, v_locality
    FROM public.boletins_rg WHERE id = NEW.boletim_id;

  SELECT count(*) INTO foreign_count
  FROM public.properties p
  JOIN public.boletins_rg b ON b.id = p.boletim_id
  WHERE p.block_number = NEW.block_number
    AND lower(trim(coalesce(b.locality,'sem-localidade'))) = lower(trim(v_locality))
    AND p.id <> NEW.id
    AND b.agent_id IS NOT NULL
    AND b.agent_id <> new_agent;

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Imóvel pertence a quarteirão % de outro agente na localidade %.', NEW.block_number, v_locality
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_property_boletim_block_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_property_boletim_block_match() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_bol_block uuid;
BEGIN
  IF NEW.boletim_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT block_id INTO v_bol_block FROM public.boletins_rg WHERE id = NEW.boletim_id;
  IF v_bol_block IS NULL THEN RETURN NEW; END IF;
  IF NEW.block_id IS NULL THEN
    NEW.block_id := v_bol_block;
  ELSIF NEW.block_id <> v_bol_block THEN
    RAISE EXCEPTION 'Imóvel % vinculado ao boletim % com block_id divergente (% != %).',
      NEW.id, NEW.boletim_id, NEW.block_id, v_bol_block
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: visits_auto_link_session(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visits_auto_link_session() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_block_id uuid;
  v_session record;
BEGIN
  IF NEW.block_id IS NULL AND NEW.property_id IS NOT NULL THEN
    SELECT block_id INTO v_block_id FROM public.properties WHERE id = NEW.property_id;
    NEW.block_id := v_block_id;
  END IF;

  IF NEW.field_work_session_id IS NULL AND NEW.agent_id IS NOT NULL AND NEW.property_id IS NOT NULL THEN
    SELECT s.id, s.cycle_id
      INTO v_session
      FROM public.field_work_sessions s
      JOIN public.properties p ON p.block_number = s.block_number
     WHERE s.user_id = NEW.agent_id
       AND p.id = NEW.property_id
       AND s.status = 'in_progress'
     ORDER BY s.created_at DESC
     LIMIT 1;

    IF FOUND THEN
      NEW.field_work_session_id := v_session.id;
      IF NEW.cycle_id IS NULL THEN
        NEW.cycle_id := v_session.cycle_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    name text NOT NULL,
    registration_id text,
    municipality text DEFAULT 'São Paulo'::text,
    phone text,
    photo_url text,
    team text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    work_status text DEFAULT 'available'::text,
    CONSTRAINT agents_work_status_check CHECK ((work_status = ANY (ARRAY['available'::text, 'in_work'::text, 'work_completed'::text])))
);


--
-- Name: annual_report_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.annual_report_summary WITH (security_invoker='true') AS
 SELECT c.year,
    count(DISTINCT c.id) AS total_cycles,
    sum(
        CASE
            WHEN (c.status = 'finished'::public.cycle_status) THEN 1
            ELSE 0
        END) AS completed_cycles,
    count(v.id) AS total_visits,
    count(
        CASE
            WHEN v.has_focus THEN 1
            ELSE NULL::integer
        END) AS total_focus,
    count(
        CASE
            WHEN v.treatment_applied THEN 1
            ELSE NULL::integer
        END) AS total_treatments,
    count(DISTINCT v.property_id) AS properties_worked
   FROM (public.cycles c
     LEFT JOIN public.visits v ON ((v.cycle_id = c.id)))
  GROUP BY c.year;


--
-- Name: areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    actor_email text,
    target_id uuid,
    action text NOT NULL,
    entity text DEFAULT 'user'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subarea_id uuid NOT NULL,
    number text NOT NULL,
    status public.block_status DEFAULT 'not_started'::public.block_status NOT NULL,
    total_properties integer DEFAULT 0,
    latitude double precision,
    longitude double precision,
    address text,
    neighborhood text,
    city text,
    location_source text,
    locality text,
    current_street text,
    current_street_confirmed_at timestamp with time zone,
    current_street_confirmed_by uuid,
    CONSTRAINT blocks_location_source_check CHECK ((location_source = ANY (ARRAY['gps'::text, 'manual'::text])))
);


--
-- Name: boletins_rg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boletins_rg (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id uuid NOT NULL,
    block_number text,
    agent_id uuid NOT NULL,
    uf text,
    municipality text,
    locality text,
    sublocality text,
    district text,
    subdistrict text,
    category_1 text,
    category_2 text,
    sequence text,
    side text,
    inspector_general text,
    inspector text,
    team_lead text,
    agent_name text,
    agent_registration text,
    finalized_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id uuid,
    street_id uuid,
    number text NOT NULL,
    type public.property_type DEFAULT 'residence'::public.property_type NOT NULL,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    complement text,
    neighborhood text,
    block_number text,
    street_name text,
    reference text,
    container_count integer DEFAULT 0,
    observations text,
    is_abandoned boolean DEFAULT false,
    is_frequently_closed boolean DEFAULT false,
    had_previous_focus boolean DEFAULT false,
    status public.property_status DEFAULT 'active'::public.property_status,
    user_id uuid,
    side text,
    sequence integer,
    inhabitants integer DEFAULT 0,
    is_block_end boolean DEFAULT false,
    boletim_id uuid,
    geocoded_at timestamp with time zone,
    geocoded_by uuid
);


--
-- Name: cycle_coverage_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.cycle_coverage_summary WITH (security_invoker='true') AS
 SELECT c.id AS cycle_id,
    c.name AS cycle_name,
    count(DISTINCT p.id) AS total_properties,
    count(DISTINCT v.property_id) AS worked_properties,
        CASE
            WHEN (count(DISTINCT p.id) = 0) THEN (0)::numeric
            ELSE round((((count(DISTINCT v.property_id))::numeric / (count(DISTINCT p.id))::numeric) * (100)::numeric), 2)
        END AS coverage_percentage
   FROM ((public.cycles c
     LEFT JOIN public.visits v ON ((v.cycle_id = c.id)))
     CROSS JOIN public.properties p)
  GROUP BY c.id, c.name;


--
-- Name: daily_work_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_work_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_agent_id uuid NOT NULL,
    cycle_id uuid NOT NULL,
    week_id uuid,
    work_date date DEFAULT public.operational_date(now()) NOT NULL,
    start_time timestamp with time zone DEFAULT now() NOT NULL,
    end_time timestamp with time zone,
    status text NOT NULL,
    properties_worked integer DEFAULT 0,
    properties_closed integer DEFAULT 0,
    properties_refused integer DEFAULT 0,
    deposits_treated integer DEFAULT 0,
    deposits_eliminated integer DEFAULT 0,
    positive_foci integer DEFAULT 0,
    pending_visits integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    properties_recovered integer DEFAULT 0,
    deposits_existing integer DEFAULT 0,
    deposits_inspected integer DEFAULT 0,
    larvicide_amount numeric DEFAULT 0,
    larvicide_unit text,
    tubitos_collected integer DEFAULT 0,
    samples_collected integer DEFAULT 0,
    blocks_completed integer DEFAULT 0,
    epi_week integer,
    epi_year integer,
    deposits_a1 integer DEFAULT 0,
    deposits_a2 integer DEFAULT 0,
    deposits_b integer DEFAULT 0,
    deposits_c integer DEFAULT 0,
    deposits_d1 integer DEFAULT 0,
    deposits_d2 integer DEFAULT 0,
    deposits_e integer DEFAULT 0,
    blocks_worked integer DEFAULT 0,
    tubitos_properties integer DEFAULT 0 NOT NULL,
    samples_total integer DEFAULT 0 NOT NULL,
    properties_positive integer DEFAULT 0 NOT NULL,
    is_retroactive boolean DEFAULT false NOT NULL,
    retroactive_reason text,
    strategic_points_worked integer DEFAULT 0 NOT NULL,
    tubitos_used integer DEFAULT 0 NOT NULL,
    larvae_collected integer DEFAULT 0 NOT NULL,
    cargas_collected integer DEFAULT 0 NOT NULL,
    foci_by_type jsonb DEFAULT '{}'::jsonb NOT NULL,
    deposits_by_type jsonb DEFAULT '{}'::jsonb NOT NULL,
    data_integrity_log jsonb,
    agent_id uuid NOT NULL,
    CONSTRAINT daily_work_records_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text])))
);


--
-- Name: data_audit_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_audit_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    score integer NOT NULL,
    alerts_count integer DEFAULT 0 NOT NULL,
    actions_count integer DEFAULT 0 NOT NULL,
    module_scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    report jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_id uuid
);


--
-- Name: field_work_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_work_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid,
    title text NOT NULL,
    notes text,
    status text DEFAULT 'active'::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: field_work_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_work_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    block_number text NOT NULL,
    street_name text NOT NULL,
    property_count integer NOT NULL,
    session_date date DEFAULT public.operational_date(now()) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cycle_id uuid,
    week_id uuid,
    is_retroactive boolean DEFAULT false NOT NULL,
    retroactive_reason text,
    block_id uuid,
    started_at timestamp with time zone
);


--
-- Name: supabase_keep_alive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supabase_keep_alive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ping_timestamp timestamp with time zone DEFAULT now(),
    ping_source text,
    response_time_ms integer,
    status text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT supabase_keep_alive_ping_source_check CHECK ((ping_source = ANY (ARRAY['app'::text, 'github_actions'::text, 'cron'::text, 'manual'::text]))),
    CONSTRAINT supabase_keep_alive_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text])))
);


--
-- Name: keep_alive_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.keep_alive_status AS
 SELECT count(*) AS total_pings,
    count(DISTINCT ping_source) AS sources_count,
    max(ping_timestamp) AS last_ping,
    ((EXTRACT(epoch FROM (now() - max(ping_timestamp))))::integer / 60) AS minutes_since_last_ping,
    count(*) FILTER (WHERE (status = 'success'::text)) AS successful_pings,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS failed_pings,
    round((((count(*) FILTER (WHERE (status = 'success'::text)))::numeric / (count(*))::numeric) * (100)::numeric), 2) AS success_rate
   FROM public.supabase_keep_alive
  WHERE (ping_timestamp > (now() - '7 days'::interval));


--
-- Name: localities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.localities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    area_id uuid NOT NULL,
    name text NOT NULL
);


--
-- Name: pending_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    reason text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    registration_number text,
    city text,
    is_active boolean DEFAULT true,
    role public.user_role_type DEFAULT 'agente'::public.user_role_type NOT NULL,
    email text,
    supervisor_id uuid,
    coordinator_id uuid
);


--
-- Name: property_pendencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_pendencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    current_status public.recovery_result NOT NULL,
    reason text,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolved_status public.recovery_result,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: property_recovery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_recovery_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    visit_id uuid,
    agent_id uuid NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    result public.recovery_result NOT NULL,
    notes text,
    latitude double precision,
    longitude double precision,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rg_ocr_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rg_ocr_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    image_url text NOT NULL,
    raw_ocr_data jsonb,
    processed_data jsonb,
    block_number text,
    street_name text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rg_ocr_imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: rg_pdf_exports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rg_pdf_exports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    filter_type text NOT NULL,
    filter_value text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rg_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rg_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rg_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rg_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    image_url text NOT NULL,
    extracted_data jsonb,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: streets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.streets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL
);


--
-- Name: subareas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subareas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    locality_id uuid NOT NULL,
    name text NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    license_plate text NOT NULL,
    brand text,
    model text,
    color text,
    observations text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: visit_deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    type_code text NOT NULL,
    description text,
    quantity integer DEFAULT 1,
    is_positive boolean DEFAULT false,
    is_treated boolean DEFAULT false,
    is_eliminated boolean DEFAULT false
);


--
-- Name: visits_backfill_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits_backfill_report (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    agent_id uuid,
    property_id uuid,
    block_id uuid,
    cycle_id uuid,
    visit_date timestamp with time zone,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weekly_bulletins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_bulletins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid,
    agent_id uuid,
    week_number integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    inspected_count integer DEFAULT 0,
    visited_count integer DEFAULT 0,
    closed_count integer DEFAULT 0,
    refused_count integer DEFAULT 0,
    abandoned_count integer DEFAULT 0,
    informed_count integer DEFAULT 0,
    residence_count integer DEFAULT 0,
    commerce_count integer DEFAULT 0,
    vacant_lot_count integer DEFAULT 0,
    strategic_point_count integer DEFAULT 0,
    other_type_count integer DEFAULT 0,
    deposits_inspected jsonb DEFAULT '{}'::jsonb,
    deposits_treated jsonb DEFAULT '{}'::jsonb,
    deposits_eliminated jsonb DEFAULT '{}'::jsonb,
    deposits_positive jsonb DEFAULT '{}'::jsonb,
    positive_focus_count integer DEFAULT 0,
    positive_property_count integer DEFAULT 0,
    focal_treatment_count integer DEFAULT 0,
    perifocal_treatment_count integer DEFAULT 0,
    insecticide_type text,
    insecticide_amount numeric DEFAULT 0,
    territory_property_count integer DEFAULT 0,
    worked_property_count integer DEFAULT 0,
    completion_percentage numeric DEFAULT 0,
    infestation_index numeric DEFAULT 0,
    pdf_url text,
    status text DEFAULT 'generated'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: weeks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weeks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    number integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    status public.week_status DEFAULT 'open'::public.week_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: agents agents_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_profile_id_key UNIQUE (profile_id);


--
-- Name: agents agents_registration_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_registration_id_key UNIQUE (registration_id);


--
-- Name: areas areas_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_code_key UNIQUE (code);


--
-- Name: areas areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: block_progress block_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_progress
    ADD CONSTRAINT block_progress_pkey PRIMARY KEY (id);


--
-- Name: block_progress block_progress_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_progress
    ADD CONSTRAINT block_progress_unique UNIQUE (cycle_id, block_number, agent_id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: boletins_rg boletins_rg_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boletins_rg
    ADD CONSTRAINT boletins_rg_pkey PRIMARY KEY (id);


--
-- Name: cycles cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycles
    ADD CONSTRAINT cycles_pkey PRIMARY KEY (id);


--
-- Name: daily_work_records daily_work_records_agent_work_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_records
    ADD CONSTRAINT daily_work_records_agent_work_date_key UNIQUE (agent_id, work_date);


--
-- Name: daily_work_records daily_work_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_records
    ADD CONSTRAINT daily_work_records_pkey PRIMARY KEY (id);


--
-- Name: data_audit_snapshots data_audit_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_audit_snapshots
    ADD CONSTRAINT data_audit_snapshots_pkey PRIMARY KEY (id);


--
-- Name: field_work_records field_work_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_work_records
    ADD CONSTRAINT field_work_records_pkey PRIMARY KEY (id);


--
-- Name: field_work_sessions field_work_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_work_sessions
    ADD CONSTRAINT field_work_sessions_pkey PRIMARY KEY (id);


--
-- Name: localities localities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.localities
    ADD CONSTRAINT localities_pkey PRIMARY KEY (id);


--
-- Name: pending_records pending_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_records
    ADD CONSTRAINT pending_records_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_pendencies property_pendencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_pendencies
    ADD CONSTRAINT property_pendencies_pkey PRIMARY KEY (id);


--
-- Name: property_pendencies property_pendencies_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_pendencies
    ADD CONSTRAINT property_pendencies_property_id_key UNIQUE (property_id);


--
-- Name: property_recovery_attempts property_recovery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_recovery_attempts
    ADD CONSTRAINT property_recovery_attempts_pkey PRIMARY KEY (id);


--
-- Name: rg_ocr_imports rg_ocr_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rg_ocr_imports
    ADD CONSTRAINT rg_ocr_imports_pkey PRIMARY KEY (id);


--
-- Name: rg_pdf_exports rg_pdf_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rg_pdf_exports
    ADD CONSTRAINT rg_pdf_exports_pkey PRIMARY KEY (id);


--
-- Name: rg_records rg_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rg_records
    ADD CONSTRAINT rg_records_pkey PRIMARY KEY (id);


--
-- Name: rg_uploads rg_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rg_uploads
    ADD CONSTRAINT rg_uploads_pkey PRIMARY KEY (id);


--
-- Name: streets streets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streets
    ADD CONSTRAINT streets_pkey PRIMARY KEY (id);


--
-- Name: subareas subareas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subareas
    ADD CONSTRAINT subareas_pkey PRIMARY KEY (id);


--
-- Name: supabase_keep_alive supabase_keep_alive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_keep_alive
    ADD CONSTRAINT supabase_keep_alive_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: cycles unique_cycle_year_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycles
    ADD CONSTRAINT unique_cycle_year_number UNIQUE (year, number);


--
-- Name: weeks unique_week_cycle_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weeks
    ADD CONSTRAINT unique_week_cycle_number UNIQUE (cycle_id, number);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: visit_deposits visit_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_deposits
    ADD CONSTRAINT visit_deposits_pkey PRIMARY KEY (id);


--
-- Name: visit_deposits visit_deposits_visit_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_deposits
    ADD CONSTRAINT visit_deposits_visit_type_unique UNIQUE (visit_id, type_code);


--
-- Name: visits_backfill_report visits_backfill_report_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits_backfill_report
    ADD CONSTRAINT visits_backfill_report_pkey PRIMARY KEY (id);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: weekly_bulletins weekly_bulletins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_bulletins
    ADD CONSTRAINT weekly_bulletins_pkey PRIMARY KEY (id);


--
-- Name: weeks weeks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weeks
    ADD CONSTRAINT weeks_pkey PRIMARY KEY (id);


--
-- Name: block_progress_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_progress_agent_idx ON public.block_progress USING btree (agent_id);


--
-- Name: block_progress_cycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_progress_cycle_idx ON public.block_progress USING btree (cycle_id);


--
-- Name: block_progress_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_progress_status_idx ON public.block_progress USING btree (status);


--
-- Name: blocks_locality_number_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX blocks_locality_number_uidx ON public.blocks USING btree (lower(TRIM(BOTH FROM COALESCE(locality, 'sem-localidade'::text))), number);


--
-- Name: cycles_one_in_progress_per_year; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cycles_one_in_progress_per_year ON public.cycles USING btree (year) WHERE (status = 'in_progress'::public.cycle_status);


--
-- Name: data_audit_snapshots_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_audit_snapshots_created_idx ON public.data_audit_snapshots USING btree (created_at DESC);


--
-- Name: field_work_records_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX field_work_records_updated_at_idx ON public.field_work_records USING btree (updated_at);


--
-- Name: field_work_records_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX field_work_records_user_id_idx ON public.field_work_records USING btree (user_id);


--
-- Name: field_work_sessions_user_date_block_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX field_work_sessions_user_date_block_unique ON public.field_work_sessions USING btree (user_id, session_date, block_id) WHERE (block_id IS NOT NULL);


--
-- Name: idx_audit_log_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_actor_id ON public.audit_log USING btree (actor_id);


--
-- Name: idx_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_log_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_target_id ON public.audit_log USING btree (target_id);


--
-- Name: idx_boletins_rg_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_boletins_rg_agent_id ON public.boletins_rg USING btree (agent_id);


--
-- Name: idx_boletins_rg_block_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_boletins_rg_block_id ON public.boletins_rg USING btree (block_id);


--
-- Name: idx_daily_work_records_epi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_work_records_epi ON public.daily_work_records USING btree (legacy_agent_id, epi_year, epi_week);


--
-- Name: idx_dwr_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dwr_agent_id ON public.daily_work_records USING btree (agent_id);


--
-- Name: idx_field_work_sessions_block_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_field_work_sessions_block_id ON public.field_work_sessions USING btree (block_id);


--
-- Name: idx_keep_alive_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keep_alive_created_at ON public.supabase_keep_alive USING btree (created_at DESC);


--
-- Name: idx_keep_alive_ping_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keep_alive_ping_source ON public.supabase_keep_alive USING btree (ping_source);


--
-- Name: idx_keep_alive_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keep_alive_source ON public.supabase_keep_alive USING btree (ping_source);


--
-- Name: idx_keep_alive_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keep_alive_status ON public.supabase_keep_alive USING btree (status);


--
-- Name: idx_keep_alive_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keep_alive_timestamp ON public.supabase_keep_alive USING btree (ping_timestamp DESC);


--
-- Name: idx_pp_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pp_agent ON public.property_pendencies USING btree (agent_id) WHERE (resolved_at IS NULL);


--
-- Name: idx_pp_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pp_status ON public.property_pendencies USING btree (current_status);


--
-- Name: idx_pra_agent_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pra_agent_date ON public.property_recovery_attempts USING btree (agent_id, attempted_at DESC);


--
-- Name: idx_pra_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pra_property ON public.property_recovery_attempts USING btree (property_id);


--
-- Name: idx_profiles_coordinator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_coordinator_id ON public.profiles USING btree (coordinator_id);


--
-- Name: idx_profiles_supervisor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_supervisor_id ON public.profiles USING btree (supervisor_id);


--
-- Name: idx_properties_boletim_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_boletim_id ON public.properties USING btree (boletim_id);


--
-- Name: idx_properties_lat_lng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_lat_lng ON public.properties USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));


--
-- Name: idx_properties_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_sequence ON public.properties USING btree (sequence);


--
-- Name: idx_visits_block_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_block_id ON public.visits USING btree (block_id);


--
-- Name: idx_visits_field_work_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_field_work_session_id ON public.visits USING btree (field_work_session_id);


--
-- Name: pending_records_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_records_entity_id_idx ON public.pending_records USING btree (entity_id);


--
-- Name: pending_records_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_records_user_id_idx ON public.pending_records USING btree (user_id);


--
-- Name: rg_records_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rg_records_updated_at_idx ON public.rg_records USING btree (updated_at);


--
-- Name: rg_records_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rg_records_user_id_idx ON public.rg_records USING btree (user_id);


--
-- Name: daily_work_records activity_logger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_logger AFTER INSERT ON public.daily_work_records FOR EACH ROW EXECUTE FUNCTION public.record_activity();


--
-- Name: boletins_rg boletins_rg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boletins_rg_updated_at BEFORE UPDATE ON public.boletins_rg FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cycles cycle_generate_weeks_aiu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cycle_generate_weeks_aiu AFTER INSERT OR UPDATE OF start_date, end_date ON public.cycles FOR EACH ROW EXECUTE FUNCTION public.trg_cycle_generate_weeks();


--
-- Name: field_work_records field_work_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER field_work_records_updated_at BEFORE UPDATE ON public.field_work_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_work_records fill_cycle_week_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fill_cycle_week_biu BEFORE INSERT OR UPDATE ON public.daily_work_records FOR EACH ROW EXECUTE FUNCTION public.fill_cycle_week_from_date();


--
-- Name: field_work_sessions fill_cycle_week_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fill_cycle_week_biu BEFORE INSERT OR UPDATE ON public.field_work_sessions FOR EACH ROW EXECUTE FUNCTION public.fill_cycle_week_from_date();


--
-- Name: visits fill_cycle_week_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fill_cycle_week_biu BEFORE INSERT OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.fill_cycle_week_from_date();


--
-- Name: pending_records pending_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pending_records_updated_at BEFORE UPDATE ON public.pending_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rg_records rg_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rg_records_updated_at BEFORE UPDATE ON public.rg_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rg_uploads set_rg_uploads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_rg_uploads_updated_at BEFORE UPDATE ON public.rg_uploads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: visits tr_check_cycle_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_check_cycle_status BEFORE INSERT OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.check_cycle_status_for_visit();


--
-- Name: cycles tr_cycle_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_cycle_transition AFTER UPDATE OF status ON public.cycles FOR EACH ROW EXECUTE FUNCTION public.handle_cycle_transition();


--
-- Name: daily_work_records tr_daily_work_records_epi_week; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_daily_work_records_epi_week BEFORE INSERT OR UPDATE OF work_date ON public.daily_work_records FOR EACH ROW EXECUTE FUNCTION public.populate_daily_epi_week();


--
-- Name: visits tr_populate_visit_metadata; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_populate_visit_metadata BEFORE INSERT ON public.visits FOR EACH ROW EXECUTE FUNCTION public.populate_visit_metadata();


--
-- Name: properties tr_sync_property_block; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_sync_property_block BEFORE INSERT OR UPDATE OF block_number ON public.properties FOR EACH ROW EXECUTE FUNCTION public.sync_property_block();


--
-- Name: properties tr_update_block_property_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_update_block_property_count AFTER INSERT OR DELETE OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_block_property_count();


--
-- Name: visits tr_visit_update_block; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_visit_update_block AFTER INSERT OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.on_visit_upsert_update_block();


--
-- Name: block_progress trg_block_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_progress_updated_at BEFORE UPDATE ON public.block_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_work_records trg_dwr_set_epi_week; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dwr_set_epi_week BEFORE INSERT OR UPDATE ON public.daily_work_records FOR EACH ROW EXECUTE FUNCTION public.set_dwr_epi_week();


--
-- Name: profiles trg_enforce_agent_supervisor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_agent_supervisor BEFORE INSERT OR UPDATE OF role, supervisor_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_supervisor();


--
-- Name: properties trg_enforce_property_geocode_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_property_geocode_update BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.enforce_property_geocode_update();


--
-- Name: profiles trg_ensure_agent_for_profile; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_agent_for_profile AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.ensure_agent_for_profile();


--
-- Name: daily_work_records trg_ensure_dwr_end_time; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_dwr_end_time BEFORE INSERT OR UPDATE OF status, end_time ON public.daily_work_records FOR EACH ROW EXECUTE FUNCTION public.ensure_dwr_end_time();


--
-- Name: properties trg_fill_property_block_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_property_block_number BEFORE INSERT OR UPDATE OF block_id ON public.properties FOR EACH ROW EXECUTE FUNCTION public.fill_property_block_number();


--
-- Name: property_recovery_attempts trg_on_recovery_attempt_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_on_recovery_attempt_insert AFTER INSERT ON public.property_recovery_attempts FOR EACH ROW EXECUTE FUNCTION public.on_recovery_attempt_insert();


--
-- Name: visits trg_on_visit_create_recovery_attempt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_on_visit_create_recovery_attempt AFTER INSERT ON public.visits FOR EACH ROW EXECUTE FUNCTION public.on_visit_create_recovery_attempt();


--
-- Name: property_pendencies trg_pp_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pp_updated_at BEFORE UPDATE ON public.property_pendencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: field_work_sessions trg_rebuild_dwr_after_session_close; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rebuild_dwr_after_session_close AFTER INSERT OR UPDATE OF status ON public.field_work_sessions FOR EACH ROW EXECUTE FUNCTION public.rebuild_dwr_after_session_close();


--
-- Name: boletins_rg trg_validate_boletim_agent_block; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_boletim_agent_block BEFORE INSERT OR UPDATE OF block_number, agent_id ON public.boletins_rg FOR EACH ROW EXECUTE FUNCTION public.validate_boletim_agent_block();


--
-- Name: field_work_sessions trg_validate_field_work_session_block; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_field_work_session_block BEFORE INSERT OR UPDATE OF block_number, user_id ON public.field_work_sessions FOR EACH ROW EXECUTE FUNCTION public.validate_field_work_session_block();


--
-- Name: properties trg_validate_property_block_ownership; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_property_block_ownership BEFORE INSERT OR UPDATE OF boletim_id, block_number ON public.properties FOR EACH ROW EXECUTE FUNCTION public.validate_property_block_ownership();


--
-- Name: properties trg_validate_property_boletim_block_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_property_boletim_block_match BEFORE INSERT OR UPDATE OF boletim_id, block_id ON public.properties FOR EACH ROW EXECUTE FUNCTION public.validate_property_boletim_block_match();


--
-- Name: visits trg_visits_auto_link_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_visits_auto_link_session BEFORE INSERT OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.visits_auto_link_session();


--
-- Name: visits trg_visits_block_progress; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_visits_block_progress AFTER INSERT OR DELETE OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.trg_visits_recompute_block_progress();


--
-- Name: properties trigger_delete_empty_block; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_delete_empty_block AFTER DELETE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.check_and_delete_empty_block();


--
-- Name: properties trigger_delete_empty_block_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_delete_empty_block_on_update AFTER UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.check_and_delete_empty_block_on_update();


--
-- Name: properties trigger_update_block_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_block_count AFTER INSERT OR DELETE OR UPDATE OF block_number ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_block_property_count();


--
-- Name: agents update_agents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_work_records update_daily_work_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_daily_work_records_updated_at BEFORE UPDATE ON public.daily_work_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: field_work_sessions update_field_work_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_field_work_sessions_updated_at BEFORE UPDATE ON public.field_work_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rg_ocr_imports update_rg_ocr_imports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rg_ocr_imports_updated_at BEFORE UPDATE ON public.rg_ocr_imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vehicles update_vehicles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agents agents_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: block_progress block_progress_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_progress
    ADD CONSTRAINT block_progress_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_subarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_subarea_id_fkey FOREIGN KEY (subarea_id) REFERENCES public.subareas(id) ON DELETE CASCADE;


--
-- Name: boletins_rg boletins_rg_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boletins_rg
    ADD CONSTRAINT boletins_rg_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE SET NULL;


--
-- Name: daily_work_records daily_work_records_agent_id_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_records
    ADD CONSTRAINT daily_work_records_agent_id_profile_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: daily_work_records daily_work_records_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_records
    ADD CONSTRAINT daily_work_records_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id);


--
-- Name: daily_work_records daily_work_records_week_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_work_records
    ADD CONSTRAINT daily_work_records_week_id_fkey FOREIGN KEY (week_id) REFERENCES public.weeks(id);


--
-- Name: field_work_records field_work_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_work_records
    ADD CONSTRAINT field_work_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: field_work_sessions field_work_sessions_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_work_sessions
    ADD CONSTRAINT field_work_sessions_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE SET NULL;


--
-- Name: field_work_sessions field_work_sessions_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_work_sessions
    ADD CONSTRAINT field_work_sessions_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id);


--
-- Name: field_work_sessions field_work_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_work_sessions
    ADD CONSTRAINT field_work_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: field_work_sessions field_work_sessions_week_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_work_sessions
    ADD CONSTRAINT field_work_sessions_week_id_fkey FOREIGN KEY (week_id) REFERENCES public.weeks(id);


--
-- Name: localities localities_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.localities
    ADD CONSTRAINT localities_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE CASCADE;


--
-- Name: pending_records pending_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_records
    ADD CONSTRAINT pending_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: properties properties_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- Name: properties properties_boletim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_boletim_id_fkey FOREIGN KEY (boletim_id) REFERENCES public.boletins_rg(id) ON DELETE SET NULL;


--
-- Name: properties properties_geocoded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_geocoded_by_fkey FOREIGN KEY (geocoded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: properties properties_street_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_street_id_fkey FOREIGN KEY (street_id) REFERENCES public.streets(id);


--
-- Name: properties properties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: rg_ocr_imports rg_ocr_imports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rg_ocr_imports
    ADD CONSTRAINT rg_ocr_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: rg_pdf_exports rg_pdf_exports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rg_pdf_exports
    ADD CONSTRAINT rg_pdf_exports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: rg_records rg_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rg_records
    ADD CONSTRAINT rg_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rg_uploads rg_uploads_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rg_uploads
    ADD CONSTRAINT rg_uploads_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subareas subareas_locality_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subareas
    ADD CONSTRAINT subareas_locality_id_fkey FOREIGN KEY (locality_id) REFERENCES public.localities(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vehicles vehicles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: visit_deposits visit_deposits_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_deposits
    ADD CONSTRAINT visit_deposits_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: visits visits_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id);


--
-- Name: visits visits_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE SET NULL;


--
-- Name: visits visits_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id);


--
-- Name: visits visits_field_work_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_field_work_session_id_fkey FOREIGN KEY (field_work_session_id) REFERENCES public.field_work_sessions(id) ON DELETE SET NULL;


--
-- Name: visits visits_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: visits visits_week_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_week_id_fkey FOREIGN KEY (week_id) REFERENCES public.weeks(id);


--
-- Name: weekly_bulletins weekly_bulletins_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_bulletins
    ADD CONSTRAINT weekly_bulletins_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id);


--
-- Name: weekly_bulletins weekly_bulletins_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_bulletins
    ADD CONSTRAINT weekly_bulletins_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id);


--
-- Name: weeks weeks_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weeks
    ADD CONSTRAINT weeks_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id) ON DELETE CASCADE;


--
-- Name: profiles Admin master can manage all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin master can manage all profiles" ON public.profiles TO authenticated USING (public.has_role(auth.uid(), 'admin_master'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));


--
-- Name: user_roles Admin master can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin master can manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin_master'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));


--
-- Name: audit_log Admin master can view all audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin master can view all audit log" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin_master'::public.app_role));


--
-- Name: visits_backfill_report Admins read backfill report; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read backfill report" ON public.visits_backfill_report FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin_master'::public.app_role));


--
-- Name: agents Agents and supervisors can update linked agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents and supervisors can update linked agents" ON public.agents FOR UPDATE TO authenticated USING (public.can_supervise_user(profile_id)) WITH CHECK (public.can_supervise_user(profile_id));


--
-- Name: agents Agents and supervisors can view linked agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents and supervisors can view linked agents" ON public.agents FOR SELECT TO authenticated USING (public.can_supervise_user(profile_id));


--
-- Name: visit_deposits Agents can insert deposits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert deposits" ON public.visit_deposits FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.visits
  WHERE ((visits.id = visit_deposits.visit_id) AND (visits.agent_id = auth.uid())))));


--
-- Name: boletins_rg Agents can insert their own boletins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert their own boletins" ON public.boletins_rg FOR INSERT TO authenticated WITH CHECK ((auth.uid() = agent_id));


--
-- Name: property_pendencies Agents can insert their own pendencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert their own pendencies" ON public.property_pendencies FOR INSERT TO authenticated WITH CHECK ((auth.uid() = agent_id));


--
-- Name: property_recovery_attempts Agents can insert their own recovery attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert their own recovery attempts" ON public.property_recovery_attempts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = agent_id));


--
-- Name: visits Agents can insert visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert visits" ON public.visits FOR INSERT TO authenticated WITH CHECK ((auth.uid() = agent_id));


--
-- Name: block_progress Agents manage own block progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents manage own block progress" ON public.block_progress TO authenticated USING ((agent_id = auth.uid())) WITH CHECK ((agent_id = auth.uid()));


--
-- Name: boletins_rg Boletins visible by owner or supervisors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Boletins visible by owner or supervisors" ON public.boletins_rg FOR SELECT TO authenticated USING (public.can_supervise_user(agent_id));


--
-- Name: cycles Cycles viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cycles viewable by authenticated" ON public.cycles FOR SELECT TO authenticated USING (true);


--
-- Name: visit_deposits Deposits viewable by owner or supervisors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Deposits viewable by owner or supervisors" ON public.visit_deposits FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.visits
  WHERE ((visits.id = visit_deposits.visit_id) AND public.can_supervise_user(visits.agent_id)))));


--
-- Name: boletins_rg Owner or supervisors can delete boletins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner or supervisors can delete boletins" ON public.boletins_rg FOR DELETE TO authenticated USING (public.can_supervise_user(agent_id));


--
-- Name: boletins_rg Owner or supervisors can update boletins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner or supervisors can update boletins" ON public.boletins_rg FOR UPDATE TO authenticated USING (public.can_supervise_user(agent_id)) WITH CHECK (public.can_supervise_user(agent_id));


--
-- Name: property_pendencies Owner or supervisors can update pendencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner or supervisors can update pendencies" ON public.property_pendencies FOR UPDATE TO authenticated USING (public.can_supervise_user(agent_id)) WITH CHECK (public.can_supervise_user(agent_id));


--
-- Name: property_pendencies Pendencies visible by owner or supervisors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pendencies visible by owner or supervisors" ON public.property_pendencies FOR SELECT TO authenticated USING (public.can_supervise_user(agent_id));


--
-- Name: property_recovery_attempts Recovery attempts visible by owner or supervisors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Recovery attempts visible by owner or supervisors" ON public.property_recovery_attempts FOR SELECT TO authenticated USING (public.can_supervise_user(agent_id));


--
-- Name: block_progress Supervision reads all block progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Supervision reads all block progress" ON public.block_progress FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin_master'::public.app_role) OR public.has_role(auth.uid(), 'coordenador'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: user_roles Supervisors can view linked roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Supervisors can view linked roles" ON public.user_roles FOR SELECT TO authenticated USING (public.can_supervise_user(user_id));


--
-- Name: system_settings System settings are viewable by all authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System settings are viewable by all authenticated users" ON public.system_settings FOR SELECT TO authenticated USING (true);


--
-- Name: system_settings System settings can be updated by managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System settings can be updated by managers" ON public.system_settings FOR UPDATE TO authenticated USING ((public.get_user_role(auth.uid()) = ANY (ARRAY['supervisor'::text, 'coordenador'::text, 'admin_master'::text]))) WITH CHECK ((public.get_user_role(auth.uid()) = ANY (ARRAY['supervisor'::text, 'coordenador'::text, 'admin_master'::text])));


--
-- Name: areas Territorial data viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Territorial data viewable by authenticated" ON public.areas FOR SELECT TO authenticated USING (true);


--
-- Name: localities Territorial data viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Territorial data viewable by authenticated" ON public.localities FOR SELECT TO authenticated USING (true);


--
-- Name: properties Territorial data viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Territorial data viewable by authenticated" ON public.properties FOR SELECT TO authenticated USING (true);


--
-- Name: streets Territorial data viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Territorial data viewable by authenticated" ON public.streets FOR SELECT TO authenticated USING (true);


--
-- Name: subareas Territorial data viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Territorial data viewable by authenticated" ON public.subareas FOR SELECT TO authenticated USING (true);


--
-- Name: localities Territorial data viewable by authenticated_localities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Territorial data viewable by authenticated_localities" ON public.localities FOR SELECT TO authenticated USING (true);


--
-- Name: streets Territorial data viewable by authenticated_streets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Territorial data viewable by authenticated_streets" ON public.streets FOR SELECT TO authenticated USING (true);


--
-- Name: subareas Territorial data viewable by authenticated_subareas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Territorial data viewable by authenticated_subareas" ON public.subareas FOR SELECT TO authenticated USING (true);


--
-- Name: properties Users and supervisors can delete linked properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users and supervisors can delete linked properties" ON public.properties FOR DELETE TO authenticated USING (((auth.uid() IS NOT NULL) AND (((user_id IS NOT NULL) AND public.can_supervise_user(user_id)) OR (EXISTS ( SELECT 1
   FROM public.boletins_rg b
  WHERE ((b.id = properties.boletim_id) AND public.can_supervise_user(b.agent_id)))))));


--
-- Name: properties Users and supervisors can insert linked properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users and supervisors can insert linked properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (user_id IS NOT NULL) AND public.can_supervise_user(user_id)));


--
-- Name: properties Users and supervisors can update linked properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users and supervisors can update linked properties" ON public.properties FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (((user_id IS NOT NULL) AND public.can_supervise_user(user_id)) OR (EXISTS ( SELECT 1
   FROM public.boletins_rg b
  WHERE ((b.id = properties.boletim_id) AND public.can_supervise_user(b.agent_id))))))) WITH CHECK (((auth.uid() IS NOT NULL) AND (((user_id IS NOT NULL) AND public.can_supervise_user(user_id)) OR (EXISTS ( SELECT 1
   FROM public.boletins_rg b
  WHERE ((b.id = properties.boletim_id) AND public.can_supervise_user(b.agent_id)))))));


--
-- Name: profiles Users and supervisors can view team profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users and supervisors can view team profiles" ON public.profiles FOR SELECT TO authenticated USING (public.can_supervise_user(id));


--
-- Name: rg_pdf_exports Users can create their own exports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own exports" ON public.rg_pdf_exports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: field_work_sessions Users can create their own field work sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own field work sessions" ON public.field_work_sessions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: vehicles Users can create their own vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: vehicles Users can delete their own vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own vehicles" ON public.vehicles FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: rg_ocr_imports Users can insert their own OCR imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own OCR imports" ON public.rg_ocr_imports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: weekly_bulletins Users can insert their own bulletins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own bulletins" ON public.weekly_bulletins FOR INSERT TO authenticated WITH CHECK ((auth.uid() = agent_id));


--
-- Name: rg_uploads Users can insert their own rg_uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own rg_uploads" ON public.rg_uploads FOR INSERT TO authenticated WITH CHECK ((auth.uid() = agent_id));


--
-- Name: rg_ocr_imports Users can update their own OCR imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own OCR imports" ON public.rg_ocr_imports FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: field_work_sessions Users can update their own field work sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own field work sessions" ON public.field_work_sessions FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: rg_uploads Users can update their own rg_uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own rg_uploads" ON public.rg_uploads FOR UPDATE TO authenticated USING ((auth.uid() = agent_id));


--
-- Name: vehicles Users can update their own vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own vehicles" ON public.vehicles FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: rg_ocr_imports Users can view their own OCR imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own OCR imports" ON public.rg_ocr_imports FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: weekly_bulletins Users can view their own bulletins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own bulletins" ON public.weekly_bulletins FOR SELECT TO authenticated USING ((auth.uid() = agent_id));


--
-- Name: rg_pdf_exports Users can view their own exports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own exports" ON public.rg_pdf_exports FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: field_work_sessions Users can view their own field work sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own field work sessions" ON public.field_work_sessions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: rg_uploads Users can view their own rg_uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own rg_uploads" ON public.rg_uploads FOR SELECT TO authenticated USING ((auth.uid() = agent_id));


--
-- Name: user_roles Users can view their own role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: vehicles Users can view their own vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own vehicles" ON public.vehicles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: visits Visits updateable by owner or linked supervisors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visits updateable by owner or linked supervisors" ON public.visits FOR UPDATE TO authenticated USING (public.can_supervise_user(agent_id)) WITH CHECK (public.can_supervise_user(agent_id));


--
-- Name: visits Visits visible by owner or linked supervisors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visits visible by owner or linked supervisors" ON public.visits FOR SELECT TO authenticated USING (public.can_supervise_user(agent_id));


--
-- Name: weeks Weeks viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Weeks viewable by authenticated" ON public.weeks FOR SELECT TO authenticated USING (true);


--
-- Name: data_audit_snapshots admin master can insert snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin master can insert snapshots" ON public.data_audit_snapshots FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));


--
-- Name: data_audit_snapshots admin master can read snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin master can read snapshots" ON public.data_audit_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin_master'::public.app_role));


--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: block_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.block_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: blocks blocks_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_delete_admin ON public.blocks FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin_master'::public.app_role));


--
-- Name: blocks blocks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_insert ON public.blocks FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: blocks blocks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_select ON public.blocks FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- Name: blocks blocks_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_update ON public.blocks FOR UPDATE TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: boletins_rg; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boletins_rg ENABLE ROW LEVEL SECURITY;

--
-- Name: cycles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_work_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_work_records ENABLE ROW LEVEL SECURITY;

--
-- Name: data_audit_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_audit_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_work_records dwr_insert_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwr_insert_self_or_admin ON public.daily_work_records FOR INSERT TO authenticated WITH CHECK (((agent_id = auth.uid()) OR (legacy_agent_id = auth.uid()) OR public.has_role(auth.uid(), 'admin_master'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: daily_work_records dwr_select_owner_supervisor_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwr_select_owner_supervisor_admin ON public.daily_work_records FOR SELECT TO authenticated USING ((public.can_supervise_user(agent_id) OR public.has_role(auth.uid(), 'admin_master'::public.app_role)));


--
-- Name: daily_work_records dwr_update_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dwr_update_self_or_admin ON public.daily_work_records FOR UPDATE TO authenticated USING (((agent_id = auth.uid()) OR (legacy_agent_id = auth.uid()) OR public.has_role(auth.uid(), 'admin_master'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role))) WITH CHECK (((agent_id = auth.uid()) OR (legacy_agent_id = auth.uid()) OR public.has_role(auth.uid(), 'admin_master'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: field_work_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.field_work_records ENABLE ROW LEVEL SECURITY;

--
-- Name: field_work_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.field_work_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: localities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_records ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: property_pendencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_pendencies ENABLE ROW LEVEL SECURITY;

--
-- Name: property_recovery_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_recovery_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: rg_ocr_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rg_ocr_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: rg_pdf_exports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rg_pdf_exports ENABLE ROW LEVEL SECURITY;

--
-- Name: rg_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rg_records ENABLE ROW LEVEL SECURITY;

--
-- Name: rg_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rg_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: streets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.streets ENABLE ROW LEVEL SECURITY;

--
-- Name: subareas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subareas ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: field_work_records users can manage own field_work_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can manage own field_work_records" ON public.field_work_records TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: pending_records users can manage own pending_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can manage own pending_records" ON public.pending_records TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: rg_records users can manage own rg_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can manage own rg_records" ON public.rg_records TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: visit_deposits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visit_deposits ENABLE ROW LEVEL SECURITY;

--
-- Name: visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

--
-- Name: visits_backfill_report; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits_backfill_report ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_bulletins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_bulletins ENABLE ROW LEVEL SECURITY;

--
-- Name: weeks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION agent_integrity_check(_fix boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.agent_integrity_check(_fix boolean) TO anon;
GRANT ALL ON FUNCTION public.agent_integrity_check(_fix boolean) TO authenticated;
GRANT ALL ON FUNCTION public.agent_integrity_check(_fix boolean) TO service_role;


--
-- Name: FUNCTION auto_data_audit_snapshot(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_data_audit_snapshot() TO anon;
GRANT ALL ON FUNCTION public.auto_data_audit_snapshot() TO authenticated;
GRANT ALL ON FUNCTION public.auto_data_audit_snapshot() TO service_role;


--
-- Name: FUNCTION autoheal_agent(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.autoheal_agent(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.autoheal_agent(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.autoheal_agent(_user_id uuid) TO service_role;


--
-- Name: FUNCTION calculate_daily_metrics_v2(p_agent_id uuid, p_cycle_id uuid, p_work_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_daily_metrics_v2(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO anon;
GRANT ALL ON FUNCTION public.calculate_daily_metrics_v2(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_daily_metrics_v2(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO service_role;


--
-- Name: FUNCTION can_supervise_user(target_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_supervise_user(target_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_supervise_user(target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_supervise_user(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION check_and_alert_hibernation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_and_alert_hibernation() TO anon;
GRANT ALL ON FUNCTION public.check_and_alert_hibernation() TO authenticated;
GRANT ALL ON FUNCTION public.check_and_alert_hibernation() TO service_role;


--
-- Name: FUNCTION check_and_delete_empty_block(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_and_delete_empty_block() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_and_delete_empty_block() TO service_role;


--
-- Name: FUNCTION check_and_delete_empty_block_on_update(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_and_delete_empty_block_on_update() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_and_delete_empty_block_on_update() TO service_role;


--
-- Name: FUNCTION check_block_completion(p_block_id uuid, p_cycle_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_block_completion(p_block_id uuid, p_cycle_id uuid) TO anon;
GRANT ALL ON FUNCTION public.check_block_completion(p_block_id uuid, p_cycle_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_block_completion(p_block_id uuid, p_cycle_id uuid) TO service_role;


--
-- Name: FUNCTION check_cycle_status_for_visit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_cycle_status_for_visit() TO anon;
GRANT ALL ON FUNCTION public.check_cycle_status_for_visit() TO authenticated;
GRANT ALL ON FUNCTION public.check_cycle_status_for_visit() TO service_role;


--
-- Name: FUNCTION check_hibernation_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_hibernation_status() TO anon;
GRANT ALL ON FUNCTION public.check_hibernation_status() TO authenticated;
GRANT ALL ON FUNCTION public.check_hibernation_status() TO service_role;


--
-- Name: FUNCTION cleanup_demo_data(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_demo_data() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_demo_data() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_demo_data() TO service_role;


--
-- Name: FUNCTION cleanup_old_pings(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_old_pings() TO anon;
GRANT ALL ON FUNCTION public.cleanup_old_pings() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_old_pings() TO service_role;


--
-- Name: FUNCTION close_week(_week_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.close_week(_week_id uuid) TO anon;
GRANT ALL ON FUNCTION public.close_week(_week_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.close_week(_week_id uuid) TO service_role;


--
-- Name: FUNCTION daily_activity_report(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.daily_activity_report() TO anon;
GRANT ALL ON FUNCTION public.daily_activity_report() TO authenticated;
GRANT ALL ON FUNCTION public.daily_activity_report() TO service_role;


--
-- Name: FUNCTION data_audit_report(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.data_audit_report() TO anon;
GRANT ALL ON FUNCTION public.data_audit_report() TO authenticated;
GRANT ALL ON FUNCTION public.data_audit_report() TO service_role;


--
-- Name: FUNCTION enforce_agent_supervisor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_agent_supervisor() TO anon;
GRANT ALL ON FUNCTION public.enforce_agent_supervisor() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_agent_supervisor() TO service_role;


--
-- Name: FUNCTION enforce_property_geocode_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_property_geocode_update() TO anon;
GRANT ALL ON FUNCTION public.enforce_property_geocode_update() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_property_geocode_update() TO service_role;


--
-- Name: FUNCTION ensure_agent_for_profile(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_agent_for_profile() TO anon;
GRANT ALL ON FUNCTION public.ensure_agent_for_profile() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_agent_for_profile() TO service_role;


--
-- Name: FUNCTION ensure_annual_cycles(target_year integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_annual_cycles(target_year integer) TO anon;
GRANT ALL ON FUNCTION public.ensure_annual_cycles(target_year integer) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_annual_cycles(target_year integer) TO service_role;


--
-- Name: FUNCTION ensure_dwr_end_time(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_dwr_end_time() TO anon;
GRANT ALL ON FUNCTION public.ensure_dwr_end_time() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_dwr_end_time() TO service_role;


--
-- Name: FUNCTION fill_cycle_week_from_date(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fill_cycle_week_from_date() TO anon;
GRANT ALL ON FUNCTION public.fill_cycle_week_from_date() TO authenticated;
GRANT ALL ON FUNCTION public.fill_cycle_week_from_date() TO service_role;


--
-- Name: FUNCTION fill_property_block_number(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fill_property_block_number() TO anon;
GRANT ALL ON FUNCTION public.fill_property_block_number() TO authenticated;
GRANT ALL ON FUNCTION public.fill_property_block_number() TO service_role;


--
-- Name: FUNCTION finalize_shift_pendencies(p_agent_id uuid, p_cycle_id uuid, p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.finalize_shift_pendencies(p_agent_id uuid, p_cycle_id uuid, p_date date) TO anon;
GRANT ALL ON FUNCTION public.finalize_shift_pendencies(p_agent_id uuid, p_cycle_id uuid, p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.finalize_shift_pendencies(p_agent_id uuid, p_cycle_id uuid, p_date date) TO service_role;


--
-- Name: FUNCTION get_coordinator_data(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_coordinator_data(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_coordinator_data(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_coordinator_data(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_correct_metrics(p_agent_id uuid, p_cycle_id uuid, p_work_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_correct_metrics(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO anon;
GRANT ALL ON FUNCTION public.get_correct_metrics(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_correct_metrics(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO service_role;


--
-- Name: TABLE cycles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cycles TO anon;
GRANT ALL ON TABLE public.cycles TO authenticated;
GRANT ALL ON TABLE public.cycles TO service_role;


--
-- Name: FUNCTION get_current_cycle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_current_cycle() TO anon;
GRANT ALL ON FUNCTION public.get_current_cycle() TO authenticated;
GRANT ALL ON FUNCTION public.get_current_cycle() TO service_role;


--
-- Name: FUNCTION get_epi_week(d date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_epi_week(d date) TO anon;
GRANT ALL ON FUNCTION public.get_epi_week(d date) TO authenticated;
GRANT ALL ON FUNCTION public.get_epi_week(d date) TO service_role;


--
-- Name: FUNCTION get_operational_block_status(_block_id uuid, _work_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_operational_block_status(_block_id uuid, _work_date date) TO anon;
GRANT ALL ON FUNCTION public.get_operational_block_status(_block_id uuid, _work_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_operational_block_status(_block_id uuid, _work_date date) TO service_role;


--
-- Name: FUNCTION operational_date(ts timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.operational_date(ts timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.operational_date(ts timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.operational_date(ts timestamp with time zone) TO service_role;


--
-- Name: TABLE visits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.visits TO anon;
GRANT ALL ON TABLE public.visits TO authenticated;
GRANT ALL ON TABLE public.visits TO service_role;


--
-- Name: FUNCTION get_session_visits(_agent_id uuid, _session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_session_visits(_agent_id uuid, _session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_session_visits(_agent_id uuid, _session_date date) TO anon;
GRANT ALL ON FUNCTION public.get_session_visits(_agent_id uuid, _session_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_session_visits(_agent_id uuid, _session_date date) TO service_role;


--
-- Name: FUNCTION get_user_role(u_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_role(u_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_role(u_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_role(u_id uuid) TO service_role;


--
-- Name: FUNCTION handle_cycle_transition(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_cycle_transition() TO anon;
GRANT ALL ON FUNCTION public.handle_cycle_transition() TO authenticated;
GRANT ALL ON FUNCTION public.handle_cycle_transition() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_updated_at() TO anon;
GRANT ALL ON FUNCTION public.handle_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.handle_updated_at() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;


--
-- Name: FUNCTION health_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.health_check() TO anon;
GRANT ALL ON FUNCTION public.health_check() TO authenticated;
GRANT ALL ON FUNCTION public.health_check() TO service_role;


--
-- Name: FUNCTION log_activity(source_type text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_activity(source_type text) TO anon;
GRANT ALL ON FUNCTION public.log_activity(source_type text) TO authenticated;
GRANT ALL ON FUNCTION public.log_activity(source_type text) TO service_role;


--
-- Name: FUNCTION on_recovery_attempt_insert(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.on_recovery_attempt_insert() FROM PUBLIC;
GRANT ALL ON FUNCTION public.on_recovery_attempt_insert() TO authenticated;
GRANT ALL ON FUNCTION public.on_recovery_attempt_insert() TO service_role;


--
-- Name: FUNCTION on_visit_create_recovery_attempt(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.on_visit_create_recovery_attempt() FROM PUBLIC;
GRANT ALL ON FUNCTION public.on_visit_create_recovery_attempt() TO authenticated;
GRANT ALL ON FUNCTION public.on_visit_create_recovery_attempt() TO service_role;


--
-- Name: FUNCTION on_visit_upsert_update_block(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.on_visit_upsert_update_block() TO anon;
GRANT ALL ON FUNCTION public.on_visit_upsert_update_block() TO authenticated;
GRANT ALL ON FUNCTION public.on_visit_upsert_update_block() TO service_role;


--
-- Name: FUNCTION populate_daily_epi_week(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.populate_daily_epi_week() TO anon;
GRANT ALL ON FUNCTION public.populate_daily_epi_week() TO authenticated;
GRANT ALL ON FUNCTION public.populate_daily_epi_week() TO service_role;


--
-- Name: FUNCTION populate_visit_metadata(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.populate_visit_metadata() TO anon;
GRANT ALL ON FUNCTION public.populate_visit_metadata() TO authenticated;
GRANT ALL ON FUNCTION public.populate_visit_metadata() TO service_role;


--
-- Name: FUNCTION rebuild_daily_work_records(_from date, _to date, _agent uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rebuild_daily_work_records(_from date, _to date, _agent uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rebuild_daily_work_records(_from date, _to date, _agent uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rebuild_daily_work_records(_from date, _to date, _agent uuid) TO service_role;


--
-- Name: FUNCTION rebuild_dwr_after_session_close(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rebuild_dwr_after_session_close() TO anon;
GRANT ALL ON FUNCTION public.rebuild_dwr_after_session_close() TO authenticated;
GRANT ALL ON FUNCTION public.rebuild_dwr_after_session_close() TO service_role;


--
-- Name: TABLE block_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.block_progress TO anon;
GRANT ALL ON TABLE public.block_progress TO authenticated;
GRANT ALL ON TABLE public.block_progress TO service_role;


--
-- Name: FUNCTION recompute_block_progress(_cycle_id uuid, _block_number text, _agent_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recompute_block_progress(_cycle_id uuid, _block_number text, _agent_id uuid) TO anon;
GRANT ALL ON FUNCTION public.recompute_block_progress(_cycle_id uuid, _block_number text, _agent_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recompute_block_progress(_cycle_id uuid, _block_number text, _agent_id uuid) TO service_role;


--
-- Name: FUNCTION reconcile_rg_integrity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reconcile_rg_integrity() TO anon;
GRANT ALL ON FUNCTION public.reconcile_rg_integrity() TO authenticated;
GRANT ALL ON FUNCTION public.reconcile_rg_integrity() TO service_role;


--
-- Name: FUNCTION record_activity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_activity() TO anon;
GRANT ALL ON FUNCTION public.record_activity() TO authenticated;
GRANT ALL ON FUNCTION public.record_activity() TO service_role;


--
-- Name: FUNCTION recover_session_visits(_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recover_session_visits(_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.recover_session_visits(_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recover_session_visits(_session_id uuid) TO service_role;


--
-- Name: FUNCTION regenerate_cycle_weeks(_cycle_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.regenerate_cycle_weeks(_cycle_id uuid) TO anon;
GRANT ALL ON FUNCTION public.regenerate_cycle_weeks(_cycle_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.regenerate_cycle_weeks(_cycle_id uuid) TO service_role;


--
-- Name: FUNCTION resolve_cycle_week(_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_cycle_week(_date date) TO anon;
GRANT ALL ON FUNCTION public.resolve_cycle_week(_date date) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_cycle_week(_date date) TO service_role;


--
-- Name: FUNCTION rg_integrity_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rg_integrity_check() TO anon;
GRANT ALL ON FUNCTION public.rg_integrity_check() TO authenticated;
GRANT ALL ON FUNCTION public.rg_integrity_check() TO service_role;


--
-- Name: FUNCTION save_data_audit_snapshot(_score integer, _module_scores jsonb, _alerts_count integer, _actions_count integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_data_audit_snapshot(_score integer, _module_scores jsonb, _alerts_count integer, _actions_count integer) TO anon;
GRANT ALL ON FUNCTION public.save_data_audit_snapshot(_score integer, _module_scores jsonb, _alerts_count integer, _actions_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.save_data_audit_snapshot(_score integer, _module_scores jsonb, _alerts_count integer, _actions_count integer) TO service_role;


--
-- Name: FUNCTION set_dwr_epi_week(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_dwr_epi_week() TO anon;
GRANT ALL ON FUNCTION public.set_dwr_epi_week() TO authenticated;
GRANT ALL ON FUNCTION public.set_dwr_epi_week() TO service_role;


--
-- Name: FUNCTION sync_cycle_statuses(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_cycle_statuses() TO anon;
GRANT ALL ON FUNCTION public.sync_cycle_statuses() TO authenticated;
GRANT ALL ON FUNCTION public.sync_cycle_statuses() TO service_role;


--
-- Name: FUNCTION sync_property_block(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_property_block() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_property_block() TO service_role;


--
-- Name: FUNCTION trg_cycle_generate_weeks(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_cycle_generate_weeks() TO anon;
GRANT ALL ON FUNCTION public.trg_cycle_generate_weeks() TO authenticated;
GRANT ALL ON FUNCTION public.trg_cycle_generate_weeks() TO service_role;


--
-- Name: FUNCTION trg_visits_recompute_block_progress(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_visits_recompute_block_progress() TO anon;
GRANT ALL ON FUNCTION public.trg_visits_recompute_block_progress() TO authenticated;
GRANT ALL ON FUNCTION public.trg_visits_recompute_block_progress() TO service_role;


--
-- Name: FUNCTION update_block_property_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_block_property_count() TO anon;
GRANT ALL ON FUNCTION public.update_block_property_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_block_property_count() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION validate_boletim_agent_block(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_boletim_agent_block() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_boletim_agent_block() TO service_role;


--
-- Name: FUNCTION validate_end_session(p_agent_id uuid, p_cycle_id uuid, p_work_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_end_session(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO anon;
GRANT ALL ON FUNCTION public.validate_end_session(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO authenticated;
GRANT ALL ON FUNCTION public.validate_end_session(p_agent_id uuid, p_cycle_id uuid, p_work_date date) TO service_role;


--
-- Name: FUNCTION validate_field_work_session_block(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_field_work_session_block() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_field_work_session_block() TO service_role;


--
-- Name: FUNCTION validate_property_block_ownership(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_property_block_ownership() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_property_block_ownership() TO service_role;


--
-- Name: FUNCTION validate_property_boletim_block_match(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_property_boletim_block_match() TO anon;
GRANT ALL ON FUNCTION public.validate_property_boletim_block_match() TO authenticated;
GRANT ALL ON FUNCTION public.validate_property_boletim_block_match() TO service_role;


--
-- Name: FUNCTION visits_auto_link_session(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.visits_auto_link_session() TO anon;
GRANT ALL ON FUNCTION public.visits_auto_link_session() TO authenticated;
GRANT ALL ON FUNCTION public.visits_auto_link_session() TO service_role;


--
-- Name: TABLE agents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agents TO anon;
GRANT ALL ON TABLE public.agents TO authenticated;
GRANT ALL ON TABLE public.agents TO service_role;


--
-- Name: TABLE annual_report_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.annual_report_summary TO anon;
GRANT ALL ON TABLE public.annual_report_summary TO authenticated;
GRANT ALL ON TABLE public.annual_report_summary TO service_role;


--
-- Name: TABLE areas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.areas TO anon;
GRANT ALL ON TABLE public.areas TO authenticated;
GRANT ALL ON TABLE public.areas TO service_role;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_log TO anon;
GRANT ALL ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


--
-- Name: TABLE blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blocks TO anon;
GRANT ALL ON TABLE public.blocks TO authenticated;
GRANT ALL ON TABLE public.blocks TO service_role;


--
-- Name: TABLE boletins_rg; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boletins_rg TO anon;
GRANT ALL ON TABLE public.boletins_rg TO authenticated;
GRANT ALL ON TABLE public.boletins_rg TO service_role;


--
-- Name: TABLE properties; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.properties TO anon;
GRANT ALL ON TABLE public.properties TO authenticated;
GRANT ALL ON TABLE public.properties TO service_role;


--
-- Name: TABLE cycle_coverage_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cycle_coverage_summary TO anon;
GRANT ALL ON TABLE public.cycle_coverage_summary TO authenticated;
GRANT ALL ON TABLE public.cycle_coverage_summary TO service_role;


--
-- Name: TABLE daily_work_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_work_records TO anon;
GRANT ALL ON TABLE public.daily_work_records TO authenticated;
GRANT ALL ON TABLE public.daily_work_records TO service_role;


--
-- Name: TABLE data_audit_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.data_audit_snapshots TO anon;
GRANT ALL ON TABLE public.data_audit_snapshots TO authenticated;
GRANT ALL ON TABLE public.data_audit_snapshots TO service_role;


--
-- Name: TABLE field_work_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.field_work_records TO anon;
GRANT ALL ON TABLE public.field_work_records TO authenticated;
GRANT ALL ON TABLE public.field_work_records TO service_role;


--
-- Name: TABLE field_work_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.field_work_sessions TO anon;
GRANT ALL ON TABLE public.field_work_sessions TO authenticated;
GRANT ALL ON TABLE public.field_work_sessions TO service_role;


--
-- Name: TABLE supabase_keep_alive; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.supabase_keep_alive TO anon;
GRANT ALL ON TABLE public.supabase_keep_alive TO authenticated;
GRANT ALL ON TABLE public.supabase_keep_alive TO service_role;


--
-- Name: TABLE keep_alive_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.keep_alive_status TO anon;
GRANT ALL ON TABLE public.keep_alive_status TO authenticated;
GRANT ALL ON TABLE public.keep_alive_status TO service_role;


--
-- Name: TABLE localities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.localities TO anon;
GRANT ALL ON TABLE public.localities TO authenticated;
GRANT ALL ON TABLE public.localities TO service_role;


--
-- Name: TABLE pending_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pending_records TO anon;
GRANT ALL ON TABLE public.pending_records TO authenticated;
GRANT ALL ON TABLE public.pending_records TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE property_pendencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.property_pendencies TO anon;
GRANT ALL ON TABLE public.property_pendencies TO authenticated;
GRANT ALL ON TABLE public.property_pendencies TO service_role;


--
-- Name: TABLE property_recovery_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.property_recovery_attempts TO anon;
GRANT ALL ON TABLE public.property_recovery_attempts TO authenticated;
GRANT ALL ON TABLE public.property_recovery_attempts TO service_role;


--
-- Name: TABLE rg_ocr_imports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rg_ocr_imports TO anon;
GRANT ALL ON TABLE public.rg_ocr_imports TO authenticated;
GRANT ALL ON TABLE public.rg_ocr_imports TO service_role;


--
-- Name: TABLE rg_pdf_exports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rg_pdf_exports TO anon;
GRANT ALL ON TABLE public.rg_pdf_exports TO authenticated;
GRANT ALL ON TABLE public.rg_pdf_exports TO service_role;


--
-- Name: TABLE rg_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rg_records TO anon;
GRANT ALL ON TABLE public.rg_records TO authenticated;
GRANT ALL ON TABLE public.rg_records TO service_role;


--
-- Name: TABLE rg_uploads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rg_uploads TO anon;
GRANT ALL ON TABLE public.rg_uploads TO authenticated;
GRANT ALL ON TABLE public.rg_uploads TO service_role;


--
-- Name: TABLE streets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.streets TO anon;
GRANT ALL ON TABLE public.streets TO authenticated;
GRANT ALL ON TABLE public.streets TO service_role;


--
-- Name: TABLE subareas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subareas TO anon;
GRANT ALL ON TABLE public.subareas TO authenticated;
GRANT ALL ON TABLE public.subareas TO service_role;


--
-- Name: TABLE system_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_settings TO anon;
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE vehicles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicles TO anon;
GRANT ALL ON TABLE public.vehicles TO authenticated;
GRANT ALL ON TABLE public.vehicles TO service_role;


--
-- Name: TABLE visit_deposits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.visit_deposits TO anon;
GRANT ALL ON TABLE public.visit_deposits TO authenticated;
GRANT ALL ON TABLE public.visit_deposits TO service_role;


--
-- Name: TABLE visits_backfill_report; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.visits_backfill_report TO anon;
GRANT ALL ON TABLE public.visits_backfill_report TO authenticated;
GRANT ALL ON TABLE public.visits_backfill_report TO service_role;


--
-- Name: TABLE weekly_bulletins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.weekly_bulletins TO anon;
GRANT ALL ON TABLE public.weekly_bulletins TO authenticated;
GRANT ALL ON TABLE public.weekly_bulletins TO service_role;


--
-- Name: TABLE weeks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.weeks TO anon;
GRANT ALL ON TABLE public.weeks TO authenticated;
GRANT ALL ON TABLE public.weeks TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--
