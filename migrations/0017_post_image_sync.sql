-- Track the last known Facebook photo separately from the current local photo.
ALTER TABLE publications ADD COLUMN fb_image_url TEXT;
ALTER TABLE publications ADD COLUMN pushed_image_url TEXT;
