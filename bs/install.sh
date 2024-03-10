#! /usr/bin/zsh

sudo rm common-storage || echo 'common-storage not found'
deno compile --unstable --output common-storage -A library/cli.ts

sudo rm /usr/bin/common-storage || echo 'common-storage binary not found'
sudo cp /home/rg/Code/ws/axon/common-storage/common-storage /usr/bin/common-storage
