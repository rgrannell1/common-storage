#! /usr/bin/env zsh

/home/rg/.deno/bin/deno compile --allow-env --allow-net src/client/client.ts
sudo ln -s /home/rg/Code/ws/axon/common-storage/client /usr/bin/cs
