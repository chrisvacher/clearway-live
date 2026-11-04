-- Fix after the practice-room run (November 3): suggested ranking options match plurals.
--
-- INT-06 Add an option shows matching suggestions as one, so the facilitator adds an option
-- once. Matching compares each suggestion's words (private.bar_words), which followed the
-- word cloud's rule of dropping a trailing s from longer words. "Prayer ministries" became
-- {prayer, ministrie} and "Prayer ministry" {prayer, ministry}, so the two showed as
-- different suggestions.
--
-- Each word is now brought to one singular form by private.singular_word: ies to y
-- (ministries, ministry), es after ch, sh, ss, x or z (churches, church), a plain s (groups,
-- group, but never the ss, us or is of class, campus or analysis), and a word ending in ie
-- takes y so it meets its plural (movie, movies). Every word is treated this way, so a phrase
-- whose last word is pluralised matches its singular. A group keeps its first-seen wording:
-- the existing rule only lets a suggestion with more words lead, and a plural has the same
-- number of words.
--
-- Shared functions redefined: private.bar_words only, with the same little words removed and
-- the same lower case and punctuation rules; only the trailing-s step is replaced. Its callers
-- (private.ranking_suggest and private.ranking_suggestions_for's grouping and match to an
-- existing option) are unchanged. The word cloud's own keys (private.parse_text_answers) and
-- Q&A folding (private.qa_words) are unchanged. Stored suggestions get their words again so
-- suggestions made before this change match too.
begin;

-- One singular form for a lower-case word, for matching only. Never shown.
create function private.singular_word(p_word text) returns text
language sql immutable security definer set search_path='' as $$
 select case when length(w)>3 and right(w,2)='ie' then left(w,-2)||'y' else w end from (select case
  when length(p_word)>4 and right(p_word,3)='ies' then left(p_word,-3)||'y'
  when length(p_word)>4 and p_word ~ '(ch|sh|ss|x|z)es$' then left(p_word,-2)
  when length(p_word)>3 and right(p_word,1)='s' and p_word !~ '(ss|us|is)$' then left(p_word,-1)
  else p_word end as w) t
$$;

-- Words for matching suggested options: lower case, no punctuation, little words dropped and
-- each word in its singular form.
create or replace function private.bar_words(p_text text) returns text[]
language sql immutable security definer set search_path='' as $$
 select coalesce(array_agg(distinct private.singular_word(w)),array[]::text[])
 from regexp_split_to_table(btrim(regexp_replace(lower(coalesce(p_text,'')),'[^[:alnum:][:space:]]','','g')),'\s+') w
 where w<>'' and w not in ('a','an','the','and','in','my','our','of','to','for','on','at','with','or')
$$;

revoke all on function private.singular_word(text) from public,anon,authenticated;

update private.ranking_suggestions set words=private.bar_words(text) where words is distinct from private.bar_words(text);

commit;
