# Architecture rules

- Daily production records use `profiles.id` in `agent_id`, the matching `agents.id` in `legacy_agent_id`, and `(agent_id, work_date)` as the canonical conflict key, because reports and RLS are profile-scoped.
- Operational maps must use the shared resilient tile provider layer, because a single external tile provider may fail independently of backend data.