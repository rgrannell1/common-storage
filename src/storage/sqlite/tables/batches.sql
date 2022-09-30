create table if not exists batches (
  batchId        text primary key,
  closed         text not null,
  created        text not null
);
