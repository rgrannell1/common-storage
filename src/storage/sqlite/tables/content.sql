create table if not exists content (
  contentId      integer primary key autoincrement,
  batchId        text not null,
  topic          text not null,
  value          blob not null,
  createdOn      text not null
);
