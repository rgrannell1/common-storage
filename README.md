# Common-Storage

Common-storage is a personal-data-server in which bookmarks, events, tasks, and
other data can be added.

## API Endpoints

- [`feed`](#/feed): an overview of the topics on the current data-server

**Administration**

- [`user`](#/user): create & manage users, and grant them permissions by
  assigning roles
- [`role`](#/role): create & manage roles, which restrict access to endpoints
  and topics

**Data Storage**

- [`topic`](#/topic): create & manage topics, which logically groups related
  data & constrains its members to matching
  [JSON Schema](https://json-schema.org/)
- [`content`](#/content): append & retrieve "content" (json entries) to a topic

**Data Synchronisation**

- [`subscription`](#/subscription): create & manage subscriptions, which sync
  content from a remote common-storage server's topic to a local topic

---

## API Details

### `feed`


An overview of the topics on the current data-server

<details>
  <summary><code>GET /feed</code> </summary>

Returns a description provided by the server, and a list of topics & associated
statistics

**Response**

```json
{
	description,
	title,
	version,
	topics: [{
		topic: {
			name,
			description,
			created
		},
		stats: {
			count,
			lastUpdated
		}
	}]
}
```

</details>

### `user`


Create & manage users, and grant them permissions by assigning roles

<details>
  <summary><code>GET /user/:name</code> </summary>

**Parameters**

- `name`: the account user-name

</details>

<details>
  <summary><code>POST /user/:name</code> </summary>

**Parameters**

- `name`: the account user-name

**Body**

```json
{
  "role": "my_user_role",
  "password": "this-is-the-user-password"
}
```

</details>

### `role`


Create & manage roles, which restrict access to endpoints and topics

<details>
  <summary><code>GET /role/:name</code> </summary>

Get details about & permissions associated with a role

**Parameters**

- `name`: the role name

</details>

<details>
  <summary><code>POST /role/:name</code> </summary>

**Parameters**

- `name`: the role name

**Body**

```json
{
  "permissions": [
    {
      "routes": ["GET /content"],
      "topics": ["notes"]
    }
  ]
}
```

</details>

### `topic`


Create & manage topics, which logically groups related data & constrains its
members to matching [JSON Schema](https://json-schema.org/)

<details>
  <summary><code>GET /topic/:name</code> </summary>

**Parameters**

**Body**

```json
```

</details>

<details>
  <summary><code>POST /topic/:name</code> </summary>

**Parameters**

**Body**

```json
```

</details>

<details>
  <summary><code>DELETE /topic/:name</code> </summary>

**Parameters**

**Body**

```json
```

</details>

### `content`


Append & retrieve "content" (json entries) to a topic

<details>
  <summary><code>GET /content/:name</code> </summary>

**Parameters**

**Body**

```json
```

</details>

<details>
  <summary><code>POST /content/:name</code> </summary>

**Parameters**

**Body**

```json
```

</details>

Append & retrieve "content" (json entries) to a topic

### `subscription`


Create & manage subscriptions, which sync content from a remote common-storage
server's topic to a local topic

<details>
  <summary><code>GET /subscription/:topic</code> </summary>

Get information about a subscription.

**Parameters**

- `topic`: the topic to which the subscriptions stores content

</details>

<details>
  <summary><code>POST /subscription/:topic</code> </summary>

Create a subscription to a remote server.

**Parameters**

- `topic`: the topic to which the subscriptions stores content

**Body**

```json
{
    source: "https://remote-server/content/notes",
    topic: "subscription.notes",
    serviceAccount: "remote_server_read_notes",
    frequency: 300,
}
```

</details>

<details>
  <summary><code>DELETE /subscription/:topic</code> </summary>

Delete a subscription.

**Parameters**

- `topic`: the topic to which the subscriptions stores content


</details>
