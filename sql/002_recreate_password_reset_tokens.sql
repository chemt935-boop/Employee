DECLARE @OldName sysname = NULL;

DECLARE @DropConstraintName sysname;
DECLARE @DropConstraintTable nvarchar(512);
DECLARE @DropConstraintSql nvarchar(max);

DECLARE @DropIndexName sysname;
DECLARE @DropIndexTable nvarchar(512);
DECLARE @DropIndexSql nvarchar(max);

DECLARE @Names TABLE (name sysname NOT NULL);
INSERT INTO @Names (name)
VALUES
  ('PK_PasswordResetTokens'),
  ('DF_PasswordResetTokens_Id'),
  ('DF_PasswordResetTokens_created_at_utc'),
  ('FK_PasswordResetTokens_Employees'),
  ('UX_PasswordResetTokens_token_hash'),
  ('IX_PasswordResetTokens_employee_id'),
  ('IX_PasswordResetTokens_expires_at_utc');

DECLARE DropConstraintCursor CURSOR FAST_FORWARD FOR
SELECT n.name
FROM @Names n
WHERE EXISTS (
  SELECT 1
  FROM sys.objects o
  WHERE o.name = n.name AND o.type IN ('PK', 'F', 'D', 'UQ', 'C')
);

OPEN DropConstraintCursor;
FETCH NEXT FROM DropConstraintCursor INTO @DropConstraintName;
WHILE @@FETCH_STATUS = 0
BEGIN
  SELECT TOP 1
    @DropConstraintTable = QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + '.' + QUOTENAME(OBJECT_NAME(parent_object_id))
  FROM sys.objects
  WHERE name = @DropConstraintName AND type IN ('PK', 'F', 'D', 'UQ', 'C');

  IF @DropConstraintTable IS NOT NULL
  BEGIN
    SET @DropConstraintSql = N'ALTER TABLE ' + @DropConstraintTable + N' DROP CONSTRAINT ' + QUOTENAME(@DropConstraintName) + N';';
    EXEC sp_executesql @DropConstraintSql;
  END

  FETCH NEXT FROM DropConstraintCursor INTO @DropConstraintName;
END

CLOSE DropConstraintCursor;
DEALLOCATE DropConstraintCursor;

DECLARE DropIndexCursor CURSOR FAST_FORWARD FOR
SELECT n.name
FROM @Names n
WHERE EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.name = n.name
);

OPEN DropIndexCursor;
FETCH NEXT FROM DropIndexCursor INTO @DropIndexName;
WHILE @@FETCH_STATUS = 0
BEGIN
  SELECT TOP 1
    @DropIndexTable = QUOTENAME(OBJECT_SCHEMA_NAME(object_id)) + '.' + QUOTENAME(OBJECT_NAME(object_id))
  FROM sys.indexes
  WHERE name = @DropIndexName;

  IF @DropIndexTable IS NOT NULL
  BEGIN
    SET @DropIndexSql = N'DROP INDEX ' + QUOTENAME(@DropIndexName) + N' ON ' + @DropIndexTable + N';';
    EXEC sp_executesql @DropIndexSql;
  END

  FETCH NEXT FROM DropIndexCursor INTO @DropIndexName;
END

CLOSE DropIndexCursor;
DEALLOCATE DropIndexCursor;

IF OBJECT_ID('dbo.PasswordResetTokens', 'U') IS NOT NULL
BEGIN
  SET @OldName = CONCAT('PasswordResetTokens_Old_', REPLACE(CONVERT(varchar(19), GETDATE(), 120), ':', ''), REPLACE(CONVERT(varchar(19), GETDATE(), 120), '-', ''), REPLACE(CONVERT(varchar(19), GETDATE(), 120), ' ', '_'));
  EXEC sp_rename 'dbo.PasswordResetTokens', @OldName;
END

CREATE TABLE dbo.PasswordResetTokens (
  Id uniqueidentifier NOT NULL CONSTRAINT DF_PasswordResetTokens_Id DEFAULT (newsequentialid()),
  employee_id INT NOT NULL,
  token_hash VARBINARY(32) NOT NULL,
  expires_at_utc DATETIME2(0) NOT NULL,
  used_at_utc DATETIME2(0) NULL,
  created_at_utc DATETIME2(0) NOT NULL CONSTRAINT DF_PasswordResetTokens_created_at_utc DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_PasswordResetTokens PRIMARY KEY (Id),
  CONSTRAINT FK_PasswordResetTokens_Employees FOREIGN KEY (employee_id) REFERENCES dbo.Employees(employee_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX UX_PasswordResetTokens_token_hash ON dbo.PasswordResetTokens(token_hash);
CREATE INDEX IX_PasswordResetTokens_employee_id ON dbo.PasswordResetTokens(employee_id);
CREATE INDEX IX_PasswordResetTokens_expires_at_utc ON dbo.PasswordResetTokens(expires_at_utc);
