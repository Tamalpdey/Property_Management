ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS profile_photo_url text;
