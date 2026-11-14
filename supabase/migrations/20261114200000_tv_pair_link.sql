-- "Open the TV in a new window" (Chris, November 14): a facilitator who runs a room from one laptop opens the TV as a
-- second window on that laptop, and it pairs itself. One click on the control surface issues a single-use pairing link;
-- the new window claims it on load as if the six-digit code had been entered.
--  * private.tv_pair_links: one row per link. Only a keyed hash of the token is stored (the app hashes it with
--    its server secret, as it does for the pairing code), bound to the engagement and the facilitator who asked, valid for
--    5 minutes and used once. RLS is forced and no policy exists, so only the service role reaches it.
--  * public.tv_pair_link(engagement, token_hash): a facilitator of that engagement issues a link (what show_allowed lets
--    pair a TV today). Limited to 10 links in 5 minutes per facilitator. Returns the engagement's skin so the app builds
--    the address from roomOrigin(skin).
--  * public.tv_pair_claim(p): service role only, called by the TV's own server request with the device's proof, exactly
--    where the code would be matched. It pairs the device the way tv_manage 'pair' does (the same columns, the same room
--    refresh), names it "This laptop" or the next free name, and uses the link up. A device already paired here keeps its
--    place; a device paired elsewhere is unpaired first (its sessions removed), as Unpair does. The claim is rate limited per address (the app's
--    sameAddress origin check runs before it, as for the code). The usual sync, prepare and bind steps then finish the pairing.
-- Nothing existing is rewritten.
begin;

create table private.tv_pair_links (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 engagement_id uuid not null references public.engagements(id),
 facilitator_id uuid not null references public.clearway_users(id),
 expires_at timestamptz not null,
 used_at timestamptz,
 device_id uuid references private.tv_devices(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted boolean not null default false
);
create index tv_pair_links_engagement_idx on private.tv_pair_links(engagement_id);
alter table private.tv_pair_links enable row level security;
alter table private.tv_pair_links force row level security;
revoke all on private.tv_pair_links from public,anon,authenticated;
grant select,insert,update,delete on private.tv_pair_links to service_role;
create trigger touch_tv_pair_link before update on private.tv_pair_links for each row execute function private.touch_live_record('id');

create function private.tv_pair_link(p_engagement uuid,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.engagements; fac uuid; at timestamptz;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 fac:=private.clearway_user_id();
 if fac is null then return jsonb_build_object('status','denied'); end if;
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','denied'); end if;
 if e.status='closed' then return jsonb_build_object('status','closed'); end if;
 if not private.tv_limit('link:'||fac::text,10,300) then return jsonb_build_object('status','limited'); end if;
 delete from private.tv_pair_links where expires_at<now()-interval '1 day';
 at:=now()+interval '5 minutes';
 insert into private.tv_pair_links(token_hash,engagement_id,facilitator_id,expires_at) values(p_token_hash,p_engagement,fac,at);
 return jsonb_build_object('status','ok','skin',e.skin,'expires_at',at);
exception when unique_violation then return jsonb_build_object('status','invalid_request');
end $$;
create function public.tv_pair_link(p_engagement uuid,p_token_hash text) returns jsonb language sql security invoker set search_path='' as $$ select private.tv_pair_link(p_engagement,p_token_hash) $$;
revoke all on function private.tv_pair_link(uuid,text),public.tv_pair_link(uuid,text) from public,anon,authenticated;
grant execute on function private.tv_pair_link(uuid,text),public.tv_pair_link(uuid,text) to authenticated;

create function private.tv_pair_claim(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l private.tv_pair_links; d private.tv_devices; e public.engagements; eng uuid; old uuid; v_label text; n integer:=1;
begin
 if p->>'proof' is null or p->>'proof' !~ '^[a-f0-9]{64}$' or p->>'token_hash' is null or p->>'token_hash' !~ '^[a-f0-9]{64}$'
   or p->>'rate' is null or p->>'rate' !~ '^[a-f0-9]{64}$' or p->>'device' is null then return jsonb_build_object('status','invalid_request'); end if;
 if not private.tv_limit('claim:'||(p->>'rate'),10,600) then return jsonb_build_object('status','limited'); end if;
 select * into l from private.tv_pair_links where token_hash=p->>'token_hash' and not deleted;
 if not found then return jsonb_build_object('status','invalid_link'); end if;
 eng:=l.engagement_id;
 -- Same order as Pair: the engagement, then its room, then the device.
 select * into e from public.engagements where id=eng and not deleted for update;
 if not found then return jsonb_build_object('status','invalid_link'); end if;
 perform 1 from public.room_states where engagement_id=eng and not deleted for update;
 select * into l from private.tv_pair_links where id=l.id for update;
 select * into d from private.tv_devices where id=(p->>'device')::uuid for update;
 if not found or d.deleted or d.proof<>p->>'proof' then return jsonb_build_object('status','denied'); end if;
 -- The same window asking again within a minute (a retried request) stays paired and changes nothing.
 if l.used_at is not null and l.device_id=d.id and d.engagement_id=eng and l.used_at>now()-interval '1 minute' and e.status<>'closed' then return jsonb_build_object('status','paired','engagement',eng); end if;
 if l.used_at is not null or l.expires_at<=now() or e.status='closed'
   or not exists(select 1 from public.churches c where c.id=e.church_id and not c.deleted)
   or not exists(select 1 from public.clearway_users u where u.id=l.facilitator_id and not u.deleted
     and (u.is_admin or exists(select 1 from public.engagement_facilitators f where f.clearway_user_id=u.id and f.engagement_id=eng and not f.deleted)))
 then return jsonb_build_object('status','invalid_link'); end if;
 if d.engagement_id is distinct from eng then
  old:=d.engagement_id;
  if old is not null then
   delete from auth.sessions where id in(select auth_session_id from private.live_tv_sessions where device_id=d.id and revoked_at is null and not deleted);
   update private.live_tv_sessions set revoked_at=coalesce(revoked_at,now()) where device_id=d.id and revoked_at is null;
  end if;
  v_label:='This laptop';
  while exists(select 1 from private.tv_devices x where x.engagement_id=eng and not x.deleted and x.id<>d.id and x.label=v_label) loop n:=n+1; v_label:='This laptop '||n; end loop;
  update private.tv_devices set engagement_id=eng,label=v_label,paired_at=now(),code_hash=null,code_expires_at=null,claim_id=null,claim_started_at=null where id=d.id;
  update public.room_states set results=private.live_results(eng) where engagement_id=eng;
  if old is not null then update public.room_states set results=private.live_results(old) where engagement_id=old and not deleted; end if;
 end if;
 update private.tv_pair_links set used_at=now(),device_id=d.id where id=l.id;
 return jsonb_build_object('status','paired','engagement',eng);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;
create function public.tv_pair_claim(p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.tv_pair_claim(p) $$;
revoke all on function private.tv_pair_claim(jsonb),public.tv_pair_claim(jsonb) from public,anon,authenticated;
grant execute on function private.tv_pair_claim(jsonb),public.tv_pair_claim(jsonb) to service_role;

commit;
