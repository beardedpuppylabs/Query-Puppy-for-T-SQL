select a.Id,b.Name,case when a.Active=1 then N'ja' else N'nein' end as State from dbo.Accounts as a left join dbo.Names as n on n.Id=a.Id outer apply(select top 1 x.Name from dbo.NameHistory as x where x.Id=a.Id order by x.ChangedAt desc) as b where a.Id>=@minimum and a.Code<>N'A''B' order by b.Name,a.Id;
with recent as(select Id,Name from dbo.Items where Active=1), shaped as(select r.Id,r.Name from recent as r) select q.Id,q.Name from(select Id,Name from shaped)as q where q.Id>0;
insert into dbo.Target(Id,Name) output inserted.Id values(@id,N'alpha');
update dbo.Target set Name=@name,ChangedAt=sysdatetime() output inserted.Id where Id=@id;
delete from dbo.Target output deleted.Id where Id=@id;
