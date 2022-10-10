
variable "DIGITAL_OCEAN_TOKEN" {}

terraform {
  required_providers {
    digitalocean = {
      source = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

provider "digitalocean" {
  token  = var.DIGITAL_OCEAN_TOKEN
}

resource "digitalocean_database_cluster" "axon-db" {
  name       = "axon-db"
  engine     = "pg"
  version    = "14"
  size       = "db-s-1vcpu-1gb"
  region     = "ams3"
  node_count = 1
}
