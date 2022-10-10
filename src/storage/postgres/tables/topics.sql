create table if not exists topics (
  topic          text primary key,
  description    text not null,
  created        text not null
);
