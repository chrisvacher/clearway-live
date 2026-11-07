-- Fictional, idempotent foundation seeds. Run only against Clearway Live.
-- Existing edits and soft-deleted history are preserved on repeated runs.
begin;
insert into public.churches(id,name,timezone,governance_body_name) values
 ('90000000-0000-4000-8000-000000000001','Clearway practice','America/Toronto','Team'),
 ('90000000-0000-4000-8000-000000000002','Riverside Church','America/Toronto','Elders') on conflict(id) do nothing;
insert into public.engagements(id,church_id,title,type,how_the_room_decides,settings) values('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000001','Practice room','practice','The room makes each decision by consensus. Votes and points show where the room is. We listen to each other and make space for concerns before agreeing on what we’ll do next.','{"seed":true,"fictional":true,"room_size":"very_small","tv_theme":"dark","texture":true,"ai_enabled":false}') on conflict(id) do nothing;
insert into public.engagements(id,church_id,title,type,how_the_room_decides,settings) values('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000002','Riverside Church Wayfinding','wayfinding','The room makes each decision by consensus. Votes and points show where the room is. We listen to each other and make space for concerns before agreeing on what we’ll do next.','{"seed":true,"fictional":true,"room_size":"very_small","tv_theme":"dark","texture":true,"ai_enabled":false}') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000011','Sarah Ellis','sarah.ellis@riverside.example','participant','Lead pastor') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000102','90000000-0000-4000-8000-000000000011','Daniel Brooks','daniel.brooks@riverside.example','participant','Executive pastor') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000103','90000000-0000-4000-8000-000000000011','Priya Shah','priya.shah@riverside.example','participant','Elder') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000104','90000000-0000-4000-8000-000000000011','Michael Reed','michael.reed@riverside.example','participant','Worship pastor') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000105','90000000-0000-4000-8000-000000000011','Elena Cruz','elena.cruz@riverside.example','participant','Children’s ministry leader') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000106','90000000-0000-4000-8000-000000000011','Jordan Parker','jordan.parker@riverside.example','participant','Youth pastor') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000107','90000000-0000-4000-8000-000000000011','Grace Chen','grace.chen@riverside.example','participant','Community care leader') on conflict(id) do nothing;
insert into public.attendees(id,engagement_id,name,email,room_role,role_at_church) values('90000000-0000-4000-8000-000000000108','90000000-0000-4000-8000-000000000011','Thomas Bennett','thomas.bennett@riverside.example','scribe','Scribe') on conflict(id) do nothing;

-- Riverside Wayfinding records (fictional). Lens 1 is open, so its seeded sentences are readable;
-- lenses 2 to 5 stay closed, so tests of "hidden until the lens opens" have sentences to hide.
-- The five Vision Outcomes are provisional, one with no indicator, for steps 3 to 6 to start from.
insert into private.lens_sentences(id,engagement_id,lens,source,text,attendee_id)
select ('90000000-0000-4000-8000-0000000003'||lpad(n::text,2,'0'))::uuid,'90000000-0000-4000-8000-000000000011'::uuid,l,src,t,('90000000-0000-4000-8000-0000000001'||lpad((1+n%7)::text,2,'0'))::uuid
from (values
 (1,1,'seeded','Most Sundays someone is baptized or tells the story of how they came to faith.'),
 (2,1,'seeded','Half of our adults are in a group that meets in a home.'),
 (3,1,'seeded','Young families make up a third of the church.'),
 (4,1,'seeded','Every generation worships in the same room on a Sunday.'),
 (5,1,'seeded','Newcomers are known by name within their first month.'),
 (6,1,'seeded','Students lead worship and serve on every team.'),
 (7,1,'seeded','Groups multiply into new homes every year.'),
 (8,1,'seeded','People bring their friends because they love this place.'),
 (9,1,'seeded','Our kids'' ministry has more volunteers than it needs.'),
 (10,1,'live','We celebrate a baptism almost every month.'),
 (11,1,'live','Grandparents and teenagers serve side by side.'),
 (12,1,'live','Our groups are where people get cared for first.'),
 (13,1,'live','Parents of toddlers find friends here.'),
 (14,1,'live','Nobody sits alone on a Sunday.'),
 (20,2,'seeded','Neighbours call us first when someone on the street needs help.'),
 (21,2,'seeded','The food bank runs out of our building five days a week.'),
 (22,2,'seeded','Two north end schools count us as partners.'),
 (30,3,'seeded','Every ministry has an apprentice leader ready to step in.'),
 (31,3,'seeded','Elders spend their time on direction, not operations.'),
 (32,3,'seeded','A residency raises two new leaders every year.'),
 (40,4,'seeded','Our building is open seven days a week.'),
 (41,4,'seeded','Giving funds ministry and a three-month reserve.'),
 (50,5,'seeded','We know which first steps help newcomers stay.'),
 (51,5,'seeded','We know how to disciple people online and in person.')
) v(n,l,src,t) on conflict do nothing;
insert into private.lens_openings(id,engagement_id,lens) values('90000000-0000-4000-8000-000000000390','90000000-0000-4000-8000-000000000011',1) on conflict do nothing;

insert into private.vision_outcomes(id,engagement_id,title,description,what_we_stop,position) values
 ('90000000-0000-4000-8000-000000000401','90000000-0000-4000-8000-000000000011','Leaders raised from within','We raise our next leaders ourselves, in every ministry.','Hiring from outside before we''ve looked within.',0),
 ('90000000-0000-4000-8000-000000000402','90000000-0000-4000-8000-000000000011','New faith stories','People meet Jesus here and tell the story of it.','Running events that don''t lead to a next step.',1),
 ('90000000-0000-4000-8000-000000000403','90000000-0000-4000-8000-000000000011','A church that shows up for the city','Our neighbours know Riverside by what it does for them.','Saying yes to every partnership request.',2),
 ('90000000-0000-4000-8000-000000000404','90000000-0000-4000-8000-000000000011','Families find a home here','Families find friends, care and a next step here.','',3),
 ('90000000-0000-4000-8000-000000000405','90000000-0000-4000-8000-000000000011','Homes and every generation','Faith grows in homes where every generation shares life.','',4)
 on conflict do nothing;
insert into private.outcome_indicators(id,engagement_id,outcome_id,text,position) values
 ('90000000-0000-4000-8000-000000000411','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401','12 apprentice leaders serve alongside a ministry lead',0),
 ('90000000-0000-4000-8000-000000000412','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401','The leader residency has placed its first 2 residents',1),
 ('90000000-0000-4000-8000-000000000413','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401','Every staff member has a CORE goal for developing a leader',2),
 ('90000000-0000-4000-8000-000000000414','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000402','40 people baptized over three years',0),
 ('90000000-0000-4000-8000-000000000415','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000402','Alpha runs three seasons a year, full each time',1),
 ('90000000-0000-4000-8000-000000000416','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000402','Every new believer has someone discipling them',2),
 ('90000000-0000-4000-8000-000000000417','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000403','The food bank partnership is open three days a week',0),
 ('90000000-0000-4000-8000-000000000418','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000403','Two north end schools are formal partners',1),
 ('90000000-0000-4000-8000-000000000419','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000405','60% of adults are in a group that meets in a home',0),
 ('90000000-0000-4000-8000-00000000041a','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000405','Every group has members from at least two generations',1)
 on conflict do nothing;

insert into private.risks(id,engagement_id,text,likelihood,impact) values
 ('90000000-0000-4000-8000-000000000421','90000000-0000-4000-8000-000000000011','We tried all five at once',0.8,0.85),
 ('90000000-0000-4000-8000-000000000422','90000000-0000-4000-8000-000000000011','Staff burned out by spring',0.65,0.77),
 ('90000000-0000-4000-8000-000000000423','90000000-0000-4000-8000-000000000011','The elders never owned the plan',0.48,0.79),
 ('90000000-0000-4000-8000-000000000424','90000000-0000-4000-8000-000000000011','Giving dropped in a hard year',0.3,0.6),
 ('90000000-0000-4000-8000-000000000425','90000000-0000-4000-8000-000000000011','We stopped praying for it',0.39,0.91),
 ('90000000-0000-4000-8000-000000000426','90000000-0000-4000-8000-000000000011','No one knew who owned what',0.58,0.66)
 on conflict do nothing;
insert into private.risk_mitigations(id,engagement_id,risk_id,text,recorded_by) values
 ('90000000-0000-4000-8000-000000000431','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000421','Launch outcomes a season apart','facilitator'),
 ('90000000-0000-4000-8000-000000000432','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000422','One owner and a real end date per goal','facilitator'),
 ('90000000-0000-4000-8000-000000000433','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000423','Elders review CORE every season','facilitator'),
 ('90000000-0000-4000-8000-000000000434','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000425','Prayer for the plan at every staff meeting','facilitator')
 on conflict do nothing;

insert into private.goals(id,engagement_id,outcome_id,title,result,result_clear,owner_attendee_id,end_date,position) values
 ('90000000-0000-4000-8000-000000000441','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401','Launch the apprentice pathway','8 apprentices placed in ministries',true,'90000000-0000-4000-8000-000000000103','2027-04-30',0),
 ('90000000-0000-4000-8000-000000000442','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401','Design the leader residency','',false,null,'2027-08-31',1),
 ('90000000-0000-4000-8000-000000000443','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401','Develop a leader in every 1:1','Every staff 1:1 sets a leader development goal',false,'90000000-0000-4000-8000-000000000102',null,2)
 on conflict do nothing;
insert into private.goal_risks(goal_id,risk_id,engagement_id) values
 ('90000000-0000-4000-8000-000000000441','90000000-0000-4000-8000-000000000422','90000000-0000-4000-8000-000000000011'),
 ('90000000-0000-4000-8000-000000000442','90000000-0000-4000-8000-000000000421','90000000-0000-4000-8000-000000000011'),
 ('90000000-0000-4000-8000-000000000443','90000000-0000-4000-8000-000000000422','90000000-0000-4000-8000-000000000011')
 on conflict do nothing;

insert into private.intent_cards(id,engagement_id,outcome_id,intent,must_do,what_we_stop) values
 ('90000000-0000-4000-8000-000000000451','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401','Every ministry is growing its own next leader.','Name an apprentice in every ministry.','Hiring from outside before we''ve looked within.'),
 ('90000000-0000-4000-8000-000000000452','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000402','People meet Jesus here and can tell the story.','Keep Alpha full every season.','Events with no next step.')
 on conflict do nothing;
insert into private.intent_card_people(card_id,attendee_id,engagement_id) values
 ('90000000-0000-4000-8000-000000000451','90000000-0000-4000-8000-000000000103','90000000-0000-4000-8000-000000000011'),
 ('90000000-0000-4000-8000-000000000452','90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000011')
 on conflict do nothing;
insert into private.first_steps(id,engagement_id,card_id,text,owner_attendee_id,due_date,position) values
 ('90000000-0000-4000-8000-000000000461','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000451','List every ministry lead and a possible apprentice','90000000-0000-4000-8000-000000000103','2026-11-27',0),
 ('90000000-0000-4000-8000-000000000462','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000452','Ask three people to share a baptism story',null,null,0)
 on conflict do nothing;

-- Milestone 7, step 2: what the check-ins need on Riverside. Goal seasons, and one goal and one first step owned by a name and email
-- with no attendee row (an .example address, so nothing is ever emailed). Idempotent: seasons are set only where empty.
update private.goals set season='JAN_APR' where id='90000000-0000-4000-8000-000000000441' and season is null;
update private.goals set season='MAY_AUG' where id='90000000-0000-4000-8000-000000000442' and season is null;
update private.goals set season='SEP_DEC' where id='90000000-0000-4000-8000-000000000443' and season is null;
insert into private.goals(id,engagement_id,outcome_id,title,result,result_clear,owner_name,owner_email,end_date,season,position) values
 ('90000000-0000-4000-8000-000000000444','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401','Welcome every first-time guest by name','Every first-time guest is greeted by name and invited back',true,'Naomi Okafor','naomi.okafor@riverside.example','2027-04-30','JAN_APR',3)
 on conflict do nothing;
insert into private.first_steps(id,engagement_id,card_id,text,owner_name,owner_email,due_date,position) values
 ('90000000-0000-4000-8000-000000000463','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000452','Invite two baptised members to tell their story on a Sunday','Marcus Webb','marcus.webb@riverside.example','2026-12-11',1)
 on conflict do nothing;

insert into private.key_metrics(id,engagement_id,text,rank) values
 ('90000000-0000-4000-8000-000000000471','90000000-0000-4000-8000-000000000011','People in groups',1),
 ('90000000-0000-4000-8000-000000000472','90000000-0000-4000-8000-000000000011','Leaders in training',2),
 ('90000000-0000-4000-8000-000000000473','90000000-0000-4000-8000-000000000011','Baptisms',3)
 on conflict do nothing;
insert into private.celebrations(id,engagement_id,text,theme) values
 ('90000000-0000-4000-8000-000000000481','90000000-0000-4000-8000-000000000011','Three baptisms last spring','faith'),
 ('90000000-0000-4000-8000-000000000482','90000000-0000-4000-8000-000000000011','The food bank served its thousandth family','city')
 on conflict do nothing;

insert into private.decisions(id,engagement_id,subject,subject_id,subject_label,decision,reasons) values
 ('90000000-0000-4000-8000-000000000491','90000000-0000-4000-8000-000000000011','outcome','90000000-0000-4000-8000-000000000401','Leaders raised from within','Confirmed','The whole room said this is the one that makes the rest possible.')
 on conflict do nothing;

-- A Congregation summary on the TV, with two sentences linked to the live sentences they came from,
-- one approval and one suggested change.
insert into private.lens_summaries(id,engagement_id,lens,state) values('90000000-0000-4000-8000-0000000004a1','90000000-0000-4000-8000-000000000011',1,'on_screen') on conflict do nothing;
insert into private.lens_summary_versions(id,engagement_id,summary_id,version,author,shown_at) values
 ('90000000-0000-4000-8000-0000000004a2','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-0000000004a1',1,'ai',now()) on conflict do nothing;
update private.lens_summaries set current_version_id='90000000-0000-4000-8000-0000000004a2' where id='90000000-0000-4000-8000-0000000004a1' and current_version_id is null;
insert into private.lens_summary_sentences(id,engagement_id,version_id,position,text) values
 ('90000000-0000-4000-8000-0000000004a3','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-0000000004a2',0,'Every Sunday the room holds people who found Riverside through a friend, and within a month each of them is known by name.'),
 ('90000000-0000-4000-8000-0000000004a4','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-0000000004a2',1,'Groups in homes are where people are cared for first, across every generation.')
 on conflict do nothing;
insert into private.lens_summary_sources(summary_sentence_id,lens_sentence_id,engagement_id) values
 ('90000000-0000-4000-8000-0000000004a3','90000000-0000-4000-8000-000000000305','90000000-0000-4000-8000-000000000011'),
 ('90000000-0000-4000-8000-0000000004a3','90000000-0000-4000-8000-000000000314','90000000-0000-4000-8000-000000000011'),
 ('90000000-0000-4000-8000-0000000004a4','90000000-0000-4000-8000-000000000302','90000000-0000-4000-8000-000000000011'),
 ('90000000-0000-4000-8000-0000000004a4','90000000-0000-4000-8000-000000000312','90000000-0000-4000-8000-000000000011')
 on conflict do nothing;
insert into private.lens_summary_responses(id,engagement_id,version_id,attendee_id,response,suggestion) values
 ('90000000-0000-4000-8000-0000000004a5','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-0000000004a2','90000000-0000-4000-8000-000000000101','approve',''),
 ('90000000-0000-4000-8000-0000000004a6','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-0000000004a2','90000000-0000-4000-8000-000000000102','suggest','Say something about young families.')
 on conflict do nothing;

insert into public.engagement_facilitators(engagement_id,clearway_user_id,role)
 select e.id,admin.id,'lead'::public.facilitator_role from public.engagements e cross join lateral
   (select id from public.clearway_users where is_admin and not deleted order by created_at,id limit 1) admin
 where e.id in('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011')
   and not exists(select 1 from public.engagement_facilitators f where f.engagement_id=e.id and f.role='lead' and not f.deleted)
 on conflict do nothing;
commit;
