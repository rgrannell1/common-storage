
variable "DIGITAL_OCEAN_TOKEN" {}
variable "DEVBOX_DOMAIN"       {}

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

data "digitalocean_ssh_key" "personal_ssh_key" {
  name = "digitalocean"
}

resource "digitalocean_droplet" "devbox_droplet" {
  image             = "ubuntu-20-04-x64"
  name              = "devbox"
  region            = "ams3"
  size              = "s-1vcpu-1gb"
  backups           = false
  monitoring        = false
  graceful_shutdown = false
  ssh_keys          = [data.digitalocean_ssh_key.personal_ssh_key.id]
}

resource "digitalocean_reserved_ip" "devbox_droplet" {
  droplet_id = digitalocean_droplet.devbox_droplet.id
  region     = digitalocean_droplet.devbox_droplet.region
}

resource "digitalocean_domain" "devbox_droplet" {
  name       = var.DEVBOX_DOMAIN
  ip_address = digitalocean_droplet.devbox_droplet.ipv4_address
}
