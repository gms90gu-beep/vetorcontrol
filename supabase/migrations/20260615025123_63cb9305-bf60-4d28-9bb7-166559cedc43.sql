
CREATE OR REPLACE FUNCTION public.data_audit_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  today date := CURRENT_DATE;
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

GRANT EXECUTE ON FUNCTION public.data_audit_report() TO authenticated, service_role;
