-- The tests' database beside the dev one (TEST_DATABASE_URL's default). Each pytest-xdist
-- worker and each agent make theirs beside it, named `myapp_<x>_test`.
CREATE DATABASE myapp_test OWNER myapp;
