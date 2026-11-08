-- Milestone 7 practice-room fixes F7 and F8: the name check keeps real names out of the report and the plan without refusing ordinary lowercase sentences.
-- The words of a note's person, an attendee, a facilitator and an owner become name words. Number words and "phone" never do, and in a free-text field neither do
-- role and description words (an attendee's surname may be Bishop). A name that is also an ordinary word (Will, Grace, Faith, Hope) counts whenever it is written
-- with a capital, wherever it sits, and only the lowercase word is clear. A month in a date is not a name. Errors fall the safe way: a dropped sentence.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated,anon,service_role;
create function tests.id(n integer) returns uuid language sql immutable as $$ select ('ae070900-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.names(n integer) returns text[] language sql security definer set search_path='' as $$ select private.report_names(tests.id(n)) $$;
create function tests.hit(txt text,n integer) returns boolean language sql security definer set search_path='' as $$ select private.discover_has_name(txt,private.report_names(tests.id(n))) $$;
grant execute on all functions in schema tests to authenticated,anon,service_role;

insert into churches(id,name,timezone) values(tests.id(200),'Riverside Church','America/Toronto');
insert into engagements(id,church_id,title) values
 (tests.id(100),tests.id(200),'Will room'),(tests.id(101),tests.id(200),'Staff member room'),(tests.id(102),tests.id(200),'Phone room'),
 (tests.id(103),tests.id(200),'Grace room'),(tests.id(104),tests.id(200),'Faith room'),(tests.id(105),tests.id(200),'Plain names room'),(tests.id(106),tests.id(200),'Probe room'),(tests.id(107),tests.id(200),'Typed notes room');
insert into auth.users(id,email,email_confirmed_at) select tests.id(n),'person'||n||'@example.org',now() from generate_series(1,20)n;
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(501),tests.id(100),tests.id(1),'Will Ross','person1@example.org',now(),'participant'),
 (tests.id(503),tests.id(102),tests.id(3),'Phone One','person3@example.org',now(),'participant'),
 (tests.id(504),tests.id(103),tests.id(4),'Grace Lee','person4@example.org',now(),'participant'),
 (tests.id(505),tests.id(104),tests.id(5),'Faith Hope','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(105),tests.id(6),'Priya Shah','person6@example.org',now(),'participant'),
 (tests.id(507),tests.id(105),tests.id(7),'Joy','person7@example.org',now(),'participant'),
 (tests.id(508),tests.id(106),tests.id(8),'Grace Lee','person8@example.org',now(),'participant'),
 (tests.id(509),tests.id(106),tests.id(9),'Mark Chen','person9@example.org',now(),'participant'),
 (tests.id(510),tests.id(106),tests.id(10),'Joy','person10@example.org',now(),'participant'),
 (tests.id(511),tests.id(106),tests.id(11),'Rose Grant','person11@example.org',now(),'participant'),
 (tests.id(512),tests.id(106),tests.id(12),'Hope','person12@example.org',now(),'participant'),
 (tests.id(513),tests.id(106),tests.id(13),'Ann Bishop','person13@example.org',now(),'participant'),
 (tests.id(514),tests.id(106),tests.id(14),'June Cole','person14@example.org',now(),'participant'),
 (tests.id(515),tests.id(106),tests.id(15),'Tom Young','person15@example.org',now(),'participant');
insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count,created_at) values
 (tests.id(601),tests.id(101),'interview','A staff member','Staff conversation','Staff want a goal.','paste',4,clock_timestamp()),
 (tests.id(602),tests.id(101),'interview','someone from the youth team','Youth conversation','Youth want a goal.','paste',4,clock_timestamp()),
 (tests.id(603),tests.id(105),'interview','pastor dave','Pastor conversation','Pastor wants a plan.','paste',4,clock_timestamp()),
 (tests.id(604),tests.id(107),'interview','dave and sue','Typed one','Notes one.','paste',2,clock_timestamp()),
 (tests.id(605),tests.id(107),'interview','sarah, tom and priya','Typed two','Notes two.','paste',2,clock_timestamp()),
 (tests.id(606),tests.id(107),'interview','pastor dave smith','Typed three','Notes three.','paste',2,clock_timestamp()),
 (tests.id(607),tests.id(107),'interview','the lead pastor (jordan)','Typed four','Notes four.','paste',2,clock_timestamp()),
 (tests.id(608),tests.id(107),'interview','alex from youth','Typed five','Notes five.','paste',2,clock_timestamp());

-- ---------- What goes into the list ----------
select is(tests.names(101),array[]::text[],'A note''s person "A staff member" and "someone from the youth team" give no name words');
select is(tests.names(102),array[]::text[],'An attendee "Phone One" gives none: phone and one are not names');
select ok('*Will'=any(tests.names(100)) and 'Ross'=any(tests.names(100)),'"Will Ross" keeps Ross as a name and Will as an ordinary-word name');
select ok('dave'=any(tests.names(105)) and not 'pastor'=any(tests.names(105)),'A note person ("pastor dave") gives its name and leaves the role word out');
select ok(private.name_words(array['Ann Bishop','Jo Guest'],false)@>array['*Bishop','*Guest','Ann'],'An attendee''s surname is kept even when it is also a role (Bishop, Guest)');
select ok(not private.name_words(array['Ann Bishop'],true)@>array['*Bishop'],'but a free-text description drops the role word');
select is(private.name_words(array['Sarah from the Youth Team'],true),array['Sarah'],'A free-text description keeps only what is a name');
select is(private.name_words(array['Mary-Jane Smith'],false),array['Jane','Mary','Smith'],'A hyphenated name gives each part');
select ok(tests.names(107)@>array['dave','*Sue','sarah','tom','priya','smith','jordan','alex'],'Lowercase names typed in a note person all count: "dave and sue", "sarah, tom and priya", "pastor dave smith", "(jordan)", "alex from youth"');
select ok(not tests.names(107)&&array['pastor','lead','youth','from','and'],'and the role and little words do not');

-- ---------- F7: ordinary lowercase sentences stand ----------
select is(tests.hit('The team will meet.',100),false,'An attendee "Will Ross" does not block "The team will meet."');
select is(tests.hit('Will Ross will lead it.',100),true,'but "Will Ross will lead it." is blocked');
select is(tests.hit('Ross will lead it.',100),true,'and so is "Ross will lead it."');
select is(tests.hit('Ask Will to lead it.',100),true,'and "Ask Will to lead it."');
select is(tests.hit('Will leads it.',100),true,'and "Will leads it." at the start of a sentence');
select is(tests.hit('Every staff member sets a goal.',101),false,'A note person "A staff member" does not block "Every staff member sets a goal."');
select is(tests.hit('Every staff member will set a leader development goal in their 1:1.',101),false,'nor the sentence the practice room refused');
select is(tests.hit('Every staff one-on-one covers the goal.',102),false,'An attendee "Phone One" does not block "one-on-one"');
select is(tests.hit('Saved by grace, and we will keep faith and hope for the best.',104),false,'lowercase grace, faith and hope are clear when people are named Grace, Faith and Hope');
select is(tests.hit('Bring joy to the room. The mark of a leader. It may rain in the young adults room.',106),false,'and so are joy, mark, may and young adults in the probe room');
select is(tests.hit('A warm welcome at the door',105),false,'A plain sentence is clear');
select is(tests.hit('priya runs the welcome table',101),false,'(control) a name that is not in the room is clear');
select is(tests.hit('The host will welcome the guest, the head of the table and the bishop.',106),false,'A lowercase role word is clear even though a surname is Bishop');

-- ---------- F7: every capitalised use of a common-word name is blocked, wherever it sits ----------
select is(tests.hit('Grace leads the welcome team.',106),true,'Grace at the start of a sentence');
select is(tests.hit('Grace''s team runs the welcome.',106),true,'as a possessive');
select is(tests.hit('The elders agreed. Grace owns it.',106),true,'after a full stop');
select is(tests.hit('Owner: Grace',106),true,'after a colon');
select is(tests.hit('(Grace) tells the staff.',106),true,'in brackets');
select is(tests.hit('The note says "Grace should lead it."',106),true,'in quotes');
select is(tests.hit(E'The first line\nGrace is next',106),true,'after a new line');
select is(tests.hit('Mark and the elders will meet.',106),true,'Mark at the start');
select is(tests.hit('Joy tells the staff.',106),true,'Joy');
select is(tests.hit('Grant leads it.',106),true,'Grant, with Rose Grant in the room');
select is(tests.hit('Rose tells the board.',106),true,'Rose');
select is(tests.hit('Hope leads it.',106),true,'Hope');
select is(tests.hit('GRACE SAID SO',106),true,'in capitals');
select is(tests.hit('Ask Hope Faith.',104),true,'Faith Hope in either order');
select is(tests.hit('Faith is the first step.',104),true,'and a capitalised Faith at the start of a sentence, which is accepted');
select is(tests.hit('Grace and truth.',103),true,'"Grace and truth." is blocked when someone is named Grace (accepted)');
select is(tests.hit('Ask Bishop about it.',106),true,'A surname that is also a role, capitalised (Ann Bishop)');
select is(tests.hit('Young leaders gather.',106),true,'A common-word surname, capitalised (Tom Young)');
select is(tests.hit('Ask Will to lead it.',106),false,'(control) a name from another room is clear');
select is(tests.hit('Ask Bishop about it.',100),false,'(control) as is a surname that is not in the room');

-- ---------- F7: a month in a date is not a name ----------
select is(tests.hit('The board meets on June 14.',106),false,'"June 14" is a date');
select is(tests.hit('Vision Sunday is in June 2027.',106),false,'"June 2027" is a date');
select is(tests.hit('We start on 14 June.',106),false,'"14 June" is a date');
select is(tests.hit('June tells the staff.',106),true,'but "June tells the staff." is a name');
select is(tests.hit('Ask June about it.',106),true,'and "Ask June about it."');
select is(tests.hit('Ask Grace Lee on June 14.',106),true,'a name next to a date is still caught');

-- ---------- The callers ----------
select is(private.report_check('Every staff member will set a goal in their 1:1.','[{"ref":"z1","text":"Staff set a goal in their 1:1.","sources":[]}]'::jsonb,tests.names(101)),null,'The report''s check lets the sentence stand');
select is(private.report_check('Will Ross will lead it.','[{"ref":"z1","text":"A leader is named.","sources":[]}]'::jsonb,tests.names(100)),'name','and still refuses a name');
select is(private.vp_check('{"stage":"staff","who":"Every staff member","hear":"Each staff member sets a goal in their 1:1."}','[{"ref":"a1","text":"Staff set a goal in their 1:1.","sources":[]}]'::jsonb,tests.names(101),null,date '2026-11-05'),null,'The plan''s row check lets the row stand');
select is(private.vp_check('{"stage":"staff","who":"Will Ross","hear":"The plan."}','[{"ref":"a1","text":"The plan.","sources":[]}]'::jsonb,tests.names(100),null,date '2026-11-05'),'name','and refuses a row that names someone');
select is(private.discover_names(tests.id(101)),array[]::text[],'Discover''s names are narrowed the same way');
select is(private.vp_check('{"stage":"staff","who":"The staff","hear":"Grace tells the staff."}','[{"ref":"a1","text":"Tell the staff.","sources":[]}]'::jsonb,tests.names(106),null,date '2026-11-05'),'name','The plan''s row check refuses a field that starts with a common-word name');
select is(private.discover_has_name('Will Ross said so.',null),false,'No names, no match');
select is(private.discover_has_name(null,array['Ross']),false,'and no text, no match');

select * from finish();
rollback;
