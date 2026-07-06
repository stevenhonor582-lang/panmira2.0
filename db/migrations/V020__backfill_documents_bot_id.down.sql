-- 回滚: 把 V020 之后从 folder 继承的 bot_id 重新置 NULL (不推荐, 仅供回滚)
UPDATE documents d
   SET bot_id = NULL
  FROM folders f
 WHERE d.folder_id = f.id
   AND f.bot_id IS NOT NULL;
