-- Milestone 7 practice-room fixes F7 and F8: the name check keeps real names out of the report and the plan without refusing ordinary sentences.
-- The words of a note's person, an attendee, a facilitator and an owner become name words, except role and description words and number words
-- (private.name_stoplist). A name that is also an ordinary word (Will, Grace, Faith, Hope) counts only as a proper noun: capitalised away from the start
-- of a sentence, or capitalised beside the person's other name. Every caller reads the same text[] (private.discover_names, private.report_names).
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
 (tests.id(103),tests.id(200),'Grace room'),(tests.id(104),tests.id(200),'Faith room'),(tests.id(105),tests.id(200),'Plain names room');
insert into auth.users(id,email,email_confirmed_at) select tests.id(n),'person'||n||'@example.org',now() from generate_series(1,8)n;
insert into attendees(id,engagement_id,auth_user_id,name,email,verified_at,room_role) values
 (tests.id(501),tests.id(100),tests.id(1),'Will Ross','person1@example.org',now(),'participant'),
 (tests.id(503),tests.id(102),tests.id(3),'Phone One','person3@example.org',now(),'participant'),
 (tests.id(504),tests.id(103),tests.id(4),'Grace Lee','person4@example.org',now(),'participant'),
 (tests.id(505),tests.id(104),tests.id(5),'Faith Hope','person5@example.org',now(),'participant'),
 (tests.id(506),tests.id(105),tests.id(6),'Priya Shah','person6@example.org',now(),'participant'),
 (tests.id(507),tests.id(105),tests.id(7),'Joy','person7@example.org',now(),'participant');
insert into private.conversation_notes(id,engagement_id,kind,person,title,body,source_kind,word_count,created_at) values
 (tests.id(601),tests.id(101),'interview','A staff member','Staff conversation','Staff want a goal.','paste',4,clock_timestamp()),
 (tests.id(602),tests.id(101),'interview','someone from the youth team','Youth conversation','Youth want a goal.','paste',4,clock_timestamp()),
 (tests.id(603),tests.id(105),'interview','pastor dave','Pastor conversation','Pastor wants a plan.','paste',4,clock_timestamp());

-- ---------- What goes into the list ----------
select is(tests.names(101),array[]::text[],'A note''s person "A staff member" and "someone from the youth team" give no name words');
select is(tests.names(102),array[]::text[],'An attendee "Phone One" gives none: phone and one are not names');
select ok('*Will|Ross'=any(tests.names(100)) and 'Ross'=any(tests.names(100)),'"Will Ross" keeps Ross as a name and Will as an ordinary-word name tied to Ross');
select ok('dave'=any(tests.names(105)) and not 'pastor'=any(tests.names(105)),'A short lowercase person ("pastor dave") still gives its name word, and the role word is left out');
select is(private.name_words(array['Sarah from the Youth Team'],true),array['Sarah'],'A long description keeps only its capitalised words that are not roles');
select is(private.name_words(array['Mary-Jane Smith'],false),array['Jane','Mary','Smith'],'A hyphenated name gives each part');

-- ---------- F7: ordinary sentences stand ----------
select is(tests.hit('The team will meet.',100),false,'An attendee "Will Ross" does not block "The team will meet."');
select is(tests.hit('Will Ross will lead it.',100),true,'but "Will Ross will lead it." is blocked');
select is(tests.hit('Ross will lead it.',100),true,'and so is "Ross will lead it."');
select is(tests.hit('Ask Will to lead it.',100),true,'and "Ask Will to lead it." (Will as a proper noun)');
select is(tests.hit('Every staff member sets a goal.',101),false,'A note person "A staff member" does not block "Every staff member sets a goal."');
select is(tests.hit('Every staff member will set a leader development goal in their 1:1.',101),false,'nor the sentence the practice room refused');
select is(tests.hit('Every staff one-on-one covers the goal.',102),false,'An attendee "Phone One" does not block "one-on-one"');
select is(tests.hit('Saved by grace.',103),false,'An attendee "Grace Lee" does not block "Saved by grace."');
select is(tests.hit('Grace and truth.',103),false,'nor "Grace and truth." at the start of a sentence');
select is(tests.hit('Then Grace said it first.',103),true,'but "Then Grace said it first." is blocked');
select is(tests.hit('Grace Lee said it first.',103),true,'and "Grace Lee said it first." (Lee is a name)');
select is(tests.hit('Thanks, Grace.',103),true,'and "Thanks, Grace."');
select is(tests.hit('Faith Hope leads it.',104),true,'Two ordinary-word names next to each other are one name: "Faith Hope leads it."');
select is(tests.hit('Hope Faith leads it.',104),true,'in either order');
select is(tests.hit('Faith is the first step and we hope it grows.',104),false,'while faith and hope as words are clear');
select is(tests.hit('We will keep faith, and hope for the best.',104),false,'in any place in a sentence');
select is(tests.hit('priya runs the welcome table',105),true,'A name that is not an ordinary word is found in any case');
select is(tests.hit('Bring joy to the room.',105),false,'"Joy" the attendee does not block "joy"');
select is(tests.hit('Ask Joy to bring it.',105),true,'but does block "Ask Joy"');
select is(tests.hit('Ask Dave about it.',105),true,'A note person''s lowercase name is found ("pastor dave")');
select is(tests.hit('A warm welcome at the door',105),false,'A plain sentence is clear');

-- ---------- The callers ----------
select is(private.report_check('Every staff member will set a goal in their 1:1.','[{"ref":"z1","text":"Staff set a goal in their 1:1.","sources":[]}]'::jsonb,tests.names(101)),null,'The report''s check lets the sentence stand');
select is(private.report_check('Will Ross will lead it.','[{"ref":"z1","text":"A leader is named.","sources":[]}]'::jsonb,tests.names(100)),'name','and still refuses a name');
select is(private.vp_check('{"stage":"staff","who":"Every staff member","hear":"Each staff member sets a goal in their 1:1."}','[{"ref":"a1","text":"Staff set a goal in their 1:1.","sources":[]}]'::jsonb,tests.names(101),null,date '2026-11-05'),null,'The plan''s row check lets the row stand');
select is(private.vp_check('{"stage":"staff","who":"Will Ross","hear":"The plan."}','[{"ref":"a1","text":"The plan.","sources":[]}]'::jsonb,tests.names(100),null,date '2026-11-05'),'name','and refuses a row that names someone');
select is(private.discover_names(tests.id(101)),array[]::text[],'Discover''s names are narrowed the same way');
select is(private.discover_has_name('Will Ross said so.',null),false,'No names, no match');
select is(private.discover_has_name(null,array['Ross']),false,'and no text, no match');

select * from finish();
rollback;
