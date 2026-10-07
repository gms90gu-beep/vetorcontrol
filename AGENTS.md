# Architecture rules

- Daily production records use `profiles.id` in `agent_id`, the matching `agents.id` in `legacy_agent_id`, and `(agent_id, work_date)` as the canonical conflict key, because reports and RLS are profile-scoped.
- Operational maps must use the shared resilient tile provider layer, because a single external tile provider may fail independently of backend data.
- Pendency reads share the cycle/week/agent scope helper for remote and cached rows, because offline fallback must not mix production periods.
- Recovery attempts use the offline repository and the sync engine restores cached parent sessions/visits before dependent writes, because connectivity loss must not discard recovery work.
- Team scope is projected through shared role/profile helpers for both remote and cached reads, while server functions validate the database role and team before privileged access, because UI filters alone are not authorization.
- Bulk operational reads use sequential pagination, because Data API row limits must not silently truncate production metrics.
- System settings default to administrative scope and use database role policies; only master administrators may classify them as operational, because managers must not gain access by changing the classification.