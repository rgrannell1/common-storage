# Common-Storage [![Test](https://github.com/rgrannell1/common-storage/actions/workflows/test.yaml/badge.svg)](https://github.com/rgrannell1/common-storage/actions/workflows/test.yaml)

Synchronise a collection of things (e.g photos, bookmarks) from one host to
another.

## Usage

> note: common-storage supports (not requires)
> [rs](https://github.com/rgrannell1/rs) as a build-system.

Start common-server in a docker-container

```bash
./bs/docker:up
```

Create a topic, to which content can be published.

```bash
curl -X POST --user *** 'localhost:8080/topic/bookmarks' -H 'Content-Type: application/json' --data '{ "description": "bookmarks I want to store" }'
```

or, using the client

```bash
export CS_USER=*********
export CS_PASWORD=*********

cs post topic bookmarks --description 'bookmarks synced between hosts'
cs post subscription bookmarks --target 'https://example.com' --frequency 60
```

## Motivation

I'm moving from cloud-services to my own personal knowledge-hub. Common-storage
is an entry-point for my personal-data (from bookmark clients, CLIs, websites,
etc.) and can push / pull data to a local common-storage service on my own
laptop & NAS periodically.

## API

Common-Storage has the following routes

| Method | Route             | Description                                         |
| ------ | ----------------- | --------------------------------------------------- |
| GET    | `/feed`           | get topics stats, endpoints published by the server |
| POST   | `/topic/:name`    | add a topic                                         |
| GET    | `/topic/:name/`   | get a topic description                             |
| GET    | `/content/:name/` | get content from a topic                            |
| POST   | `/content/:name`  | add content to a topic, as part of a batch          |

| Method | Route               | Description           |
| ------ | ------------------- | --------------------- |
| GET    | `/subscription/:id` | get subscription data |
| POST   | `/subscription/:id` | update subscription   |
| DELETE | `/subscription/:id` | delete subscription   |

## File Layouts

<details>
  <summary>See File Layouts</summary>

```
.env                  # local environment-variable bindings
digitalocean.tf       # deploy a database to digitalocean
dockerfile            # deploy common-storage to a docker-container
docker-compose.yml    # start a docker-container with environmental variable's bound
```

```
bs/                     # build scripts. Call directly with shell, or use
  coverage.sh           # get code-coverage
  deploy.sh             # deno-deploy the API
  docker:build.sh       # build a docker-container
  docker:up.sh          # start a docker container
  launch.sh             # launch the common-storage directly
  terraform:apply.sh    # apply digitalocean terraform template
  terraform:apply.sh    # delete digitalocean terraform assets
  test.sh               # launch tests
```

```
src/
  api/                # route information
  logger/             # logging implementations
  storage/            # underlying storage implementations
  types/
    interfaces/       # interfaces for storage, logging, etc.

  app.ts              # defines an Opine app
  config.ts           # pulls environmental binding and instantiates singletons
  launch.ts           # start the common-storage server
```

```
tests/
  run-test.ts         # accepts configuration options, runs the tests!
  server-suite.ts     # hooks server expectations up with testcase inputs
  storage-suite.ts    # hooks storage expectations up with testcase inputs

  expectations/       # property-based expectations for program-behaviour, parameterised by input
    routes/           # expectations for each API route
    storage/          # expecations for IStorage implementations
  utils/              # utility code for tests
```

</details>

## License

The MIT License

Copyright (c) 2022 Róisín Grannell

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
