select [Odd]]Name],"Quoted""Name",@parameter,N'Grüße ''SQL''',a.Value/* nested /* exact */ comment */from dbo.[Order] as a-- keep this comment
where a.Value>=10 and a.Value<>20;
