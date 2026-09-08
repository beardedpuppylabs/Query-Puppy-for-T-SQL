select N'GO in a string' as Value,[go],"go";
/* protected
GO
*/
GO
update dbo.Target set Name=N'x' where Id=1;
  GO 3 -- repeat exactly
delete from dbo.Target output deleted.Id where Id=2;
GO /* final delimiter */
