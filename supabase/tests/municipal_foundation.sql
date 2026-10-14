-- Executed with postgres on the isolated copy. All fixture changes roll back.
do $test$
declare actor uuid; ordinary uuid; draft uuid; original uuid; denied boolean;
begin
  begin
    select id into strict actor from public.profiles where role::text='admin_master' limit 1;
    select id into strict ordinary from public.profiles where id<>actor limit 1;
    select id into strict original from public.municipalities where slug='euclides-da-cunha-ba';
    insert into public.platform_administrators(user_id) values(actor);
    draft:=public.create_municipality_draft(actor,'Município teste','BA','municipio-isolamento-teste');
    if (select count(*) from public.platform_audit_log where municipality_id=draft and actor_id=actor)<>1 then raise exception 'Missing atomic audit'; end if;
    denied:=false;
    begin update public.municipalities set state='active' where id=draft; exception when check_violation then denied:=true; end;
    if not denied then raise exception 'Second operational municipality was activated'; end if;
    denied:=false;
    begin update public.properties set municipality_id=draft where id=(select id from public.properties limit 1); exception when check_violation then denied:=true; end;
    if not denied then raise exception 'Operational data crossed the phase-one fence'; end if;
    if has_function_privilege('authenticated','public.create_municipality_draft(uuid,text,text,text)','execute') then raise exception 'Privileged RPC exposed'; end if;
    if has_table_privilege('anon','public.platform_administrators','select') then raise exception 'Platform grants exposed to anonymous'; end if;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',ordinary::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
    if (select count(*) from public.municipalities)<>1 then raise exception 'Municipal user can see another municipality'; end if;
    if exists(select 1 from public.platform_administrators) then raise exception 'Municipal user can see global administrator'; end if;
    if exists(select 1 from public.platform_audit_log) then raise exception 'Municipal user can see platform audit'; end if;
    denied:=false;
    begin insert into public.platform_administrators(user_id) values(ordinary); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Self privilege escalation allowed'; end if;
    denied:=false;
    begin insert into public.municipalities(name,state_code,slug) values('Teste','BA','unauthorized-test'); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Municipal user can create municipality'; end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    if (select count(*) from public.municipalities)<>2 then raise exception 'Platform registry unavailable'; end if;
    if (select count(*) from public.platform_administrators)<>1 then raise exception 'Platform administrator self read failed'; end if;
    if (select count(*) from public.platform_audit_log where municipality_id=draft)<>1 then raise exception 'Platform audit read failed'; end if;
    execute 'reset role';
    update public.platform_administrators set is_active=false where user_id=actor;
    execute 'set local role authenticated';
    if (select count(*) from public.municipalities)<>1 then raise exception 'Revoked platform access remains effective'; end if;
    raise exception using errcode='P0001',message='MUNICIPAL_TEST_ROLLBACK';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'MUNICIPAL_TEST_ROLLBACK' then raise; end if;
  end;
end $test$;
select 'passed: 14 permission/fence/audit assertions; fixture rolled back' as result;
