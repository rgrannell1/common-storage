#!/usr/bin/env bash

source "bs/env.sh"

zsh -c "$(fzf < bs/calls.text.sh)"
