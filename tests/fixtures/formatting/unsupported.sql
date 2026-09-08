CREATE PROCEDURE dbo.p AS
BEGIN TRY
  SELECT 1;
END TRY
BEGIN CATCH
  THROW;
END CATCH;
GO
MERGE dbo.Target AS t USING dbo.Source AS s ON s.Id=t.Id WHEN MATCHED THEN UPDATE SET t.Name=s.Name;
GO
DECLARE @sql nvarchar(max)=N'SELECT * FROM dbo.T WHERE Id=@id';
EXEC sys.sp_executesql @sql,N'@id int',@id=1;
