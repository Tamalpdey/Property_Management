CREATE TABLE event_publication (
    id uuid PRIMARY KEY,
    publication_date timestamptz NOT NULL,
    listener_id text NOT NULL,
    serialized_event text NOT NULL,
    event_type text NOT NULL,
    completion_date timestamptz,
    last_resubmission_date timestamptz,
    completion_attempts integer NOT NULL DEFAULT 0,
    status text
);

CREATE INDEX idx_event_publication_incomplete ON event_publication (publication_date)
    WHERE completion_date IS NULL;
CREATE INDEX idx_event_publication_listener ON event_publication (listener_id);

CREATE TABLE event_publication_archive (
    id uuid PRIMARY KEY,
    publication_date timestamptz NOT NULL,
    listener_id text NOT NULL,
    serialized_event text NOT NULL,
    event_type text NOT NULL,
    completion_date timestamptz,
    last_resubmission_date timestamptz,
    completion_attempts integer NOT NULL DEFAULT 0,
    status text
);

CREATE INDEX idx_event_publication_archive_publication ON event_publication_archive (publication_date);
CREATE INDEX idx_event_publication_archive_listener ON event_publication_archive (listener_id);
