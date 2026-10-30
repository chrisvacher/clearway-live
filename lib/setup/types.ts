export type ChurchForm={name:string;timezone:string;logo_url:string;mission:string;purpose:string;values:string;strategy:string;leadership_rhythms:string;governance_body_name:string};
export type EngagementForm={title:string;type:string;status:string;start_date:string;end_date:string;retreat_start_date:string;retreat_end_date:string;pre_call_local:string;base_year:string;lens_names:string[];how_the_room_decides:string;settings:{ai_enabled:boolean;scripture_translation:string;tv_theme:string;texture:boolean;room_size:string;neutral_join_message:boolean}};
export type SetupForm={church:ChurchForm;engagement:EngagementForm;lead:string;co:string;hub_client:string;hub_engagement:string};
export type Member={id:string;name:string;email:string};
export type Attendee={id:string;name:string;email:string;room_role:"participant"|"scribe";role_at_church:string;extra_fields:Record<string,string>};
