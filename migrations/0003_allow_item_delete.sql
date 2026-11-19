-- Items can now be deleted (users still cannot). The API warns first when the
-- item is an alternative for another one, then removes those links with it.
DROP TRIGGER items_no_delete;
