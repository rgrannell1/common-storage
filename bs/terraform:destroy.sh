#! /usr/bin/env zsh

export $(cat .env | xargs)
terraform destroy
