#! /usr/bin/env zsh

deno compile --allow-env --allow-net src/client/client.ts
sudo ln -s /home/rg/Code/common-storage/client /usr/bin/cs
