create table if not exists content (
  contentId      serial primary key,
  batchId        text not null,
  topic          text not null,
  value          text not null,
  created        text not null
);
