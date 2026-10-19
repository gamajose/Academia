-- 067_clean_plans_and_update_admin_password.sql
-- Exclusao de todos os planos para permitir cadastro limpo pelo usuario
-- e garantia da senha Joseluiz1 para o usuario admin@academia.com

TRUNCATE TABLE plans CASCADE;

UPDATE users
SET password_hash = 'pbkdf2$210000$ac4ae135270a74a8d85c99d6bf4fef10$cc232ebf1ba3d2b882453b5c843e785ef6f7f86caa0a792bbc7c399c0ee0f19ee19d39063db1c027a271f635eb253134d64ecf786fdde06673e758fa476a64a4'
WHERE lower(email) = 'admin@academia.com';
