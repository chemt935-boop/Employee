IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PasswordResetTokens' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.PasswordResetTokens (
    employee_id INT NOT NULL,
    token_hash VARBINARY(32) NOT NULL,
    expires_at_utc DATETIME2(0) NOT NULL,
    used_at_utc DATETIME2(0) NULL,
    created_at_utc DATETIME2(0) NOT NULL CONSTRAINT DF_PasswordResetTokens_created_at_utc DEFAULT (SYSUTCDATETIME())
  );
END

IF COL_LENGTH('dbo.PasswordResetTokens', 'employee_id') IS NULL
  ALTER TABLE dbo.PasswordResetTokens ADD employee_id INT NULL;

IF COL_LENGTH('dbo.PasswordResetTokens', 'token_hash') IS NULL
  ALTER TABLE dbo.PasswordResetTokens ADD token_hash VARBINARY(32) NULL;

IF COL_LENGTH('dbo.PasswordResetTokens', 'expires_at_utc') IS NULL
  ALTER TABLE dbo.PasswordResetTokens ADD expires_at_utc DATETIME2(0) NULL;

IF COL_LENGTH('dbo.PasswordResetTokens', 'used_at_utc') IS NULL
  ALTER TABLE dbo.PasswordResetTokens ADD used_at_utc DATETIME2(0) NULL;

IF COL_LENGTH('dbo.PasswordResetTokens', 'created_at_utc') IS NULL
BEGIN
  ALTER TABLE dbo.PasswordResetTokens ADD created_at_utc DATETIME2(0) NULL;
  ALTER TABLE dbo.PasswordResetTokens ADD CONSTRAINT DF_PasswordResetTokens_created_at_utc DEFAULT (SYSUTCDATETIME()) FOR created_at_utc;
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PasswordResetTokens_Employees')
BEGIN
  ALTER TABLE dbo.PasswordResetTokens WITH NOCHECK
  ADD CONSTRAINT FK_PasswordResetTokens_Employees
  FOREIGN KEY (employee_id) REFERENCES dbo.Employees(employee_id) ON DELETE CASCADE;
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PasswordResetTokens_token_hash' AND object_id = OBJECT_ID('dbo.PasswordResetTokens'))
  CREATE INDEX IX_PasswordResetTokens_token_hash ON dbo.PasswordResetTokens(token_hash);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PasswordResetTokens_employee_id' AND object_id = OBJECT_ID('dbo.PasswordResetTokens'))
  CREATE INDEX IX_PasswordResetTokens_employee_id ON dbo.PasswordResetTokens(employee_id);
