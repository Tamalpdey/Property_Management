INSERT INTO schema_milestones (name)
VALUES ('lorne-reference-seed-ready')
ON CONFLICT (name) DO NOTHING;
